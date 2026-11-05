type Sprite = HTMLImageElement | HTMLVideoElement

const pixels = new Map<string, ImageData | null>()
const canvas = document.createElement('canvas')
const context = canvas.getContext('2d', { willReadFrequently: true })

export function imagePoint(
  x: number, y: number, width: number, height: number,
  imageWidth: number, imageHeight: number, fit: string, position: string
): { x: number; y: number } | null {
  const scale = fit === 'cover'
    ? Math.max(width / imageWidth, height / imageHeight)
    : Math.min(width / imageWidth, height / imageHeight)
  const drawWidth = fit === 'fill' ? width : imageWidth * scale
  const drawHeight = fit === 'fill' ? height : imageHeight * scale
  const [px = '50%', py = '50%'] = position.split(' ')
  const offset = (value: string, space: number) => value.endsWith('%')
    ? parseFloat(value) * space / 100 : parseFloat(value)
  const ix = (x - offset(px, width - drawWidth)) / drawWidth * imageWidth
  const iy = (y - offset(py, height - drawHeight)) / drawHeight * imageHeight
  return ix >= 0 && iy >= 0 && ix < imageWidth && iy < imageHeight ? { x: ix, y: iy } : null
}

function spriteHit(sprite: Sprite, x: number, y: number): boolean {
  const width = sprite.offsetWidth
  const height = sprite.offsetHeight
  if (!width || !height) return false
  const rect = sprite.getBoundingClientRect()
  if (x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom) return false
  let matrix = new DOMMatrix()
  let opacity = 1
  for (let element: HTMLElement | null = sprite; element; element = element.parentElement) {
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none') return false
    opacity *= Number(style.opacity)
    matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform).multiply(matrix)
  }
  if (opacity <= 24 / 255) return false
  matrix.e = 0
  matrix.f = 0
  const corners = [[0, 0], [width, 0], [0, height], [width, height]]
    .map(([x, y]) => matrix.transformPoint({ x, y }))
  matrix.e = rect.left - Math.min(...corners.map(p => p.x))
  matrix.f = rect.top - Math.min(...corners.map(p => p.y))
  const local = matrix.inverse().transformPoint({ x, y })
  if (!(local.x >= 0 && local.y >= 0 && local.x < width && local.y < height)) return false
  const style = getComputedStyle(sprite)
  if (context) {
    const radii = [style.borderTopLeftRadius, style.borderTopRightRadius,
      style.borderBottomRightRadius, style.borderBottomLeftRadius].map(value => {
      const [rx, ry = rx] = value.split(' ')
      return {
        x: parseFloat(rx) * (rx.endsWith('%') ? width / 100 : 1),
        y: parseFloat(ry) * (ry.endsWith('%') ? height / 100 : 1)
      }
    })
    if (radii.some(radius => radius.x || radius.y)) {
      const path = new Path2D()
      path.roundRect(0, 0, width, height, radii)
      if (!context.isPointInPath(path, local.x, local.y)) return false
    }
  }
  if (style.clipPath.startsWith('polygon(') && context) {
    const path = new Path2D()
    const points = style.clipPath.slice(8, -1).split(',').map(pair => pair.trim().split(/\s+/))
    for (const [index, [px, py]] of points.entries()) {
      const cx = parseFloat(px) * (px.endsWith('%') ? width / 100 : 1)
      const cy = parseFloat(py) * (py.endsWith('%') ? height / 100 : 1)
      if (index === 0) path.moveTo(cx, cy)
      else path.lineTo(cx, cy)
    }
    path.closePath()
    if (!context.isPointInPath(path, local.x, local.y)) return false
  }
  const video = sprite instanceof HTMLVideoElement
  const iw = video ? sprite.videoWidth : sprite.naturalWidth
  const ih = video ? sprite.videoHeight : sprite.naturalHeight
  if (!iw || !ih || (video ? sprite.readyState < 2 : !sprite.complete)) return false
  const point = imagePoint(local.x, local.y, width, height, iw, ih, style.objectFit, style.objectPosition)
  if (!point) return false
  const src = sprite.currentSrc || sprite.src
  const animated = video || !/\.png(?:[?#]|$)/i.test(src)
  let data = pixels.get(src)
  if (data === undefined || (animated && data !== null)) {
    try {
      if (!context) return true
      canvas.width = iw
      canvas.height = ih
      context.drawImage(sprite, 0, 0, iw, ih)
      data = context.getImageData(0, 0, iw, ih)
    } catch {
      data = null
    }
    if (pixels.size >= 32) pixels.delete(pixels.keys().next().value!)
    if (!animated || data === null) pixels.set(src, data)
  }
  return data === null || data.data[(Math.floor(point.y) * iw + Math.floor(point.x)) * 4 + 3] * opacity > 24
}

export function isCapriSpriteHit(x: number, y: number): boolean {
  return [...document.querySelectorAll<Sprite>('[data-capri-sprite]')]
    .some(sprite => spriteHit(sprite, x, y))
}

export function isCapriHit(x: number, y: number): boolean {
  return !!document.elementFromPoint(x, y)?.closest('[data-capri-hit]') || isCapriSpriteHit(x, y)
}

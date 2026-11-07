import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import electron from 'electron'

if (!process.versions.electron) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = spawnSync(electron, [fileURLToPath(import.meta.url)], { env, stdio: 'inherit', windowsHide: true })
  process.exit(result.status ?? 1)
}

const { app, BrowserWindow } = electron
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
async function run() {
  await app.whenReady()
  const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } })
  try {
    await window.loadURL('data:text/html,<html><body style="margin:0"></body></html>')
    const compile = name => ts.transpileModule(readFileSync(new URL(`../src/renderer/src/companion/${name}.ts`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText
    const result = await window.webContents.executeJavaScript(`(async () => {
      const exports = {};
      ${compile('companion-hit-test')}
      let checks = 0;
      const check = (value, message) => { if (!value) throw new Error(message); checks++; };
      const image = document.createElement('canvas');
      image.width = 100; image.height = 200;
      const ctx = image.getContext('2d');
      ctx.fillStyle = 'white'; ctx.fillRect(10, 20, 25, 80);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(60, 20, 25, 80);
      const parent = document.createElement('div');
      parent.style.cssText = 'position:absolute;left:100px;top:100px;width:200px;height:200px';
      const sprite = document.createElement('img');
      sprite.dataset.capriSprite = '';
      sprite.style.cssText = 'width:200px;height:200px;object-fit:contain;pointer-events:none';
      sprite.src = image.toDataURL();
      parent.append(sprite); document.body.append(parent); await sprite.decode();
      check(!isCapriHit(110, 150), 'letterboxing must pass through');
      check(isCapriHit(170, 150), 'opaque body must capture');
      check(!isCapriHit(220, 150), 'alpha below threshold must pass through');
      sprite.style.objectFit = 'cover';
      check(isCapriHit(140, 150), 'object-cover crop must map to image pixels');
      sprite.style.objectFit = 'contain';
      const readPixels = context.getImageData;
      context.getImageData = () => { throw new DOMException('tainted', 'SecurityError'); };
      check(isCapriHit(220, 150), 'unreadable canvas must fall back to image bounds');
      check(!isCapriHit(110, 150), 'canvas fallback must still exclude letterboxing');
      context.getImageData = readPixels;
      pixels.clear();
      parent.style.transform = 'scaleX(-1)';
      check(isCapriHit(230, 150), 'mirrored body must capture');
      check(!isCapriHit(170, 150), 'mirrored transparent pixels must pass through');
      parent.style.transform = 'rotate(90deg) scale(0.5)';
      check(isCapriHit(225, 185), 'nested rotation and scaling must map to body');
      parent.style.transform = '';
      sprite.style.objectPosition = '0% 50%';
      check(isCapriHit(120, 150), 'object position must be respected');
      sprite.style.objectPosition = '50% 50%';
      sprite.style.clipPath = 'polygon(0 0,100% 0,100% 20%,0 20%)';
      check(!isCapriHit(170, 150), 'clipped pixels must pass through');
      sprite.style.clipPath = '';
      parent.style.visibility = 'hidden';
      check(!isCapriHit(170, 150), 'hidden sprite must pass through');
      parent.style.visibility = '';
      const ui = document.createElement('button');
      ui.dataset.capriHit = ''; ui.style.cssText = 'position:absolute;left:10px;top:10px;width:60px;height:30px';
      document.body.append(ui);
      check(isCapriHit(20, 20), 'explicit UI must capture');
      check(!isCapriSpriteHit(20, 20), 'UI must not count as sprite');
      const empty = document.createElement('canvas'); empty.width = 100; empty.height = 200;
      sprite.src = empty.toDataURL(); await sprite.decode();
      check(!isCapriHit(170, 150), 'changed visible frame must replace alpha data');
      sprite.src = image.toDataURL(); await sprite.decode();
      const calls = [], effects = [];
      window.api = { companion: { setClickThrough: value => { calls.push(value); return Promise.resolve(); } } };
      const require = name => name === 'react'
        ? { useRef: value => ({ current: value }), useEffect: callback => effects.push(callback) }
        : { isCapriHit };
      ${compile('useCompanionHitTest')}
      const options = { isGamingMode: false, isGameForeground: false, keepCapturing: false, onHover: () => {} };
      exports.useCompanionHitTest(options);
      const cleanups = effects.map(effect => effect());
      const move = (x, y, ctrlKey = false) => window.dispatchEvent(new MouseEvent('mousemove', { clientX:x, clientY:y, ctrlKey }));
      check(calls.at(-1) === true, 'desktop starts click-through');
      move(110, 150); check(calls.length === 1, 'transparent moves do not repeat IPC');
      move(170, 150); check(calls.at(-1) === false, 'body enables desktop capture');
      window.dispatchEvent(new MouseEvent('mousedown', {clientX:170,clientY:150}));
      move(110, 150); check(calls.at(-1) === false, 'drag keeps capture outside body');
      window.dispatchEvent(new MouseEvent('mouseup')); check(calls.at(-1) === true, 'release restores transparent hit test');
      options.keepCapturing = true; move(110,150); check(calls.at(-1) === false, 'menu or text input holds capture');
      options.keepCapturing = false; options.isGamingMode = true;
      move(170,150); check(calls.at(-1) === true, 'gaming body requires Ctrl');
      move(170,150,true); check(calls.at(-1) === false, 'Ctrl enables gaming body');
      move(110,150,true); check(calls.at(-1) === true, 'Ctrl does not capture transparent gaming space');
      options.isGameForeground = true; options.keepCapturing = true;
      move(170,150,true); check(calls.at(-1) === true, 'game foreground overrides capture');
      options.isGameForeground = false; options.isGamingMode = false; options.keepCapturing = false;
      move(170,150); document.dispatchEvent(new MouseEvent('mouseleave'));
      check(calls.at(-1) === true, 'mouseleave restores click-through');
      cleanups.forEach(cleanup => cleanup?.());
      return checks;
    })()`)
    console.log(`Companion hitbox: ${result} Chromium assertions passed`)
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
}
void run()

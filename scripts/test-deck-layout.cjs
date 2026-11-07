const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
if (!process.versions.electron || process.env.ELECTRON_RUN_AS_NODE) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const result = require('node:child_process').spawnSync(require('electron'), [__filename], {
    env, stdio: 'inherit', windowsHide: true
  })
  if (result.error) throw result.error
  process.exit(result.status ?? 1)
}
const { app, BrowserWindow, ipcMain } = require('electron')

const root = path.resolve(__dirname, '..')
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-deck-layout-'))
app.setPath('userData', data)
let language = 'es'
let minimized = false
let closed = false

ipcMain.handle('companion:getLanguage', () => language)
ipcMain.handle('companion:getUserProfile', () => ({ name: '', hasName: false, onboardingDone: true }))
ipcMain.handle('agent:detectOllama', () => ({ running: false, models: [] }))
ipcMain.handle('deck:status', () => true)
ipcMain.handle('llm:getSettings', () => ({ provider: 'codex', codexModel: 'gpt-6.1-sol' }))
ipcMain.handle('dialog:selectDirectory', () => 'C:\\projects\\a-very-long-project-folder-name-for-layout')
ipcMain.handle('window:minimize', (event) => {
  minimized = true
  BrowserWindow.fromWebContents(event.sender).minimize()
})
ipcMain.handle('window:close', (event) => {
  closed = true
  BrowserWindow.fromWebContents(event.sender).hide()
})

const evaluate = (win, fn) => win.webContents.executeJavaScript(`(${fn})()`)
const settle = (win) => evaluate(win, () => new Promise((resolve) => setTimeout(resolve, 100)))

async function run() {
  await app.whenReady()
  const win = new BrowserWindow({
    width: 840, height: 580, frame: false, show: false,
    webPreferences: {
      preload: path.join(root, 'out/preload/index.mjs'), sandbox: false, backgroundThrottling: false
    }
  })
  for (language of ['es', 'en', 'de', 'fr', 'it', 'pt', 'ru', 'ja', 'ko', 'zh']) {
    await win.loadFile(path.join(root, 'out/renderer/index.html'), { hash: 'deck' })
    await settle(win)
    await evaluate(win, () => document.querySelector('.cp-root > div button').click())
    await settle(win)
    assert.match(await evaluate(win, () => document.querySelector('.cp-root > div button').textContent),
      /a-very-long-project-folder-name-for-layout/, 'long project name selected')
    for (const width of [840, 1040, 1440]) {
      win.setSize(width, 580)
      await settle(win)
      const result = await evaluate(win, () => {
        const header = document.querySelector('.cp-root > div')
        const bounds = header.getBoundingClientRect()
        return [...header.querySelectorAll('button, select')].map((element) => {
          const r = element.getBoundingClientRect()
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
          return {
            title: element.title || element.textContent.trim(),
            visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth &&
              r.top >= 0 && r.bottom <= bounds.bottom && (hit === element || element.contains(hit))
          }
        })
      })
      assert.ok(result.length >= 10, 'header rendered')
      assert.deepEqual(result.filter((item) => !item.visible), [], `${language} at ${width}px`)
      console.log(`PASS ${language} ${width}px: all ${result.length} controls visible and reachable`)
      if (language === 'es' && width === 840) {
        fs.writeFileSync(path.join(data, 'deck-840.png'), (await win.webContents.capturePage()).toPNG())
      }
    }
  }
  win.setSize(840, 580)
  await settle(win)
  const buttons = await evaluate(win, () => [...document.querySelector('.cp-root > div').querySelectorAll('button')]
    .slice(-2).map((button) => {
      const r = button.getBoundingClientRect()
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
    }))
  for (const position of buttons) {
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...position })
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...position })
    await settle(win)
  }
  assert.ok(minimized, 'minimize button invokes window:minimize at 840px')
  assert.ok(closed, 'close button invokes window:close at 840px')
  console.log(`PASS minimize and close at 840px; screenshot: ${path.join(data, 'deck-840.png')}`)
  win.destroy()
}

run().then(() => app.exit(0)).catch((error) => {
  console.error(error)
  app.exit(1)
})


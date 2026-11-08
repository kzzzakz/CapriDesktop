import { assetPath } from '../services/app-paths'
import { BrowserWindow, app, screen } from 'electron'
import { join } from 'path'
import { windowManager } from './window-manager'

export function createDeckWindow(): BrowserWindow {
  const preloadPath = join(__dirname, '../preload/index.mjs')
  const iconPath = assetPath('icon.png')

  // Wide enough for the whole top bar, minimize and close included, in every language; never bigger
  // than the screen it opens on
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1280, screenWidth - 40)
  const height = Math.min(800, screenHeight - 40)

  const deckWindow = new BrowserWindow({
    title: 'Capricorn // Dev Deck',
    icon: iconPath,
    width,
    height,
    minWidth: 840,
    minHeight: 580,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#07080e',
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Hash route for dev deck view
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) {
    deckWindow.loadURL(`${devUrl}#/deck`)
  } else {
    deckWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: 'deck'
    })
  }

  // Intercept close: hide deck and restore desktop companion
  deckWindow.on('close', (event) => {
    if (!(app as unknown as { isQuitting?: boolean }).isQuitting) {
      event.preventDefault()
      windowManager.hideDeck()
    }
  })

  return deckWindow
}

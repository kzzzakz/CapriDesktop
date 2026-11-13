import React, { useState, useEffect } from 'react'
import { CapriCommandCenter } from './CapriCommandCenter'
import { CodeEditorView } from './CodeEditorView'
import { SettingsHub, type SettingsTab } from './SettingsHub'
import { useCompanionStore } from '../stores/useCompanionStore'
import { useAgentStore } from '../stores/useAgentStore'
import { useT, useUiLang } from '../utils/useUiLang'
import {
  Minus,
  X,
  Settings,
  Cpu,
  MessageSquare,
  Code2,
  FolderGit2,
  FolderOpen,
  Volume2,
  VolumeX,
  Eye
} from 'lucide-react'

type DeckTab = 'chat' | 'editor'

export const DevDeckView: React.FC = () => {
  const [isMac, setIsMac] = useState(() => /Mac/i.test(navigator.platform))
  useEffect(() => {window.api.platform.status().then(s => setIsMac(s.platform === 'darwin'))}, [])
  const [activeTab, setActiveTab] = useState<DeckTab>('chat')
  // Every setting lives in one window, with its sections as tabs
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('ai')
  const openSettings = (tab: SettingsTab = 'ai') => {
    setSettingsTab(tab)
    setIsSettingsOpen(true)
  }
  useEffect(() => window.api.desktop.onOpenSettings(() => openSettings('ai')), [])
  useEffect(() => window.api.desktop.onOpenVoiceSettings(() => openSettings('voice')), [])
  const [settingsRevision, setSettingsRevision] = useState(0)
  const { setEmotion, setSpeech } = useCompanionStore()
  const t = useT()
  const lang = useUiLang()
  const isEs = lang === 'es'
  const [configLoaded, setConfigLoaded] = useState(false)
  const [cloudModel, setCloudModel] = useState<string | null>(null)
  const [isWatchingScreen, setIsWatchingScreen] = useState(false)
  const {
    isRunning,
    projectPath,
    setProjectPath,
    llmModel,
    ollamaModels,
    isDevVoiceEnabled,
    setDevVoiceEnabled,
    setLlmConfig,
    setOllamaStatus
  } = useAgentStore()

  // On mount: scan for local Ollama models and ensure Capri is in eyes mode in Dev Deck
  useEffect(() => {
    if (window.api) {
      Promise.all([window.api.agent.getConfig(), window.api.agent.getLlmSettings()]).then(([config, settings]) => {
        setLlmConfig(config)
        setCloudModel(settings.provider === 'cloud' ? settings.model : settings.provider === 'app' ? settings.model || settings.preset : null)
        setConfigLoaded(true)
      })
      window.api.agent.detectOllama().then((res) => {
        if (res) setOllamaStatus(res)
      })
    }
  }, [setLlmConfig, setOllamaStatus])

  // Sync screen watch mode state
  useEffect(() => {
    if (window.api?.scanner) {
      window.api.scanner.getStatus().then((st) => {
        setIsWatchingScreen(!!st.isWatchingScreen)
      })
      const unsubscribe = window.api.scanner.onEvent((ev) => {
        if (typeof ev.isWatchingScreen === 'boolean') {
          setIsWatchingScreen(ev.isWatchingScreen)
        }
      })
      return () => unsubscribe()
    }
  }, [])

  // A cloud model is chosen in the settings: the top bar only shows it
  useEffect(() => {
    if (isSettingsOpen) return
    window.api?.agent.getLlmSettings().then((s) => setCloudModel(s.provider === 'cloud' ? s.model : s.provider === 'app' ? s.model || s.preset : null))
    window.api?.agent.detectOllama().then((res) => res && setOllamaStatus(res))
  }, [isSettingsOpen, activeTab, settingsRevision, setOllamaStatus])

  const handleMinimize = async () => {
    if (window.api) await window.api.window.minimize()
  }

  const handleClose = async () => {
    if (window.api) await window.api.window.close()
  }

  const handleModelChange = (modelName: string) => {
    setLlmConfig({ model: modelName })
    window.api?.agent.setConfig({ model: modelName })
  }

  // Only real, installed Ollama models (plus the current one if it isn't listed yet)
  const currentModel = llmModel
  const modelOptions = Array.from(new Set([...(ollamaModels || []), currentModel].filter(Boolean))).filter(
    (m) => !/llava|vision|-vl\b/i.test(m) || m === currentModel
  )

  return (
    <div className={`${isMac ? 'cp-deck-mac ' : ''}cp-vars cp-root w-screen h-screen flex flex-col bg-[#100607] text-stone-200 border border-[#381a1b] overflow-hidden select-none`}>

      {/* Top bar */}
      <div
        className="cp-deck-toolbar min-h-10 bg-[#170a0b] border-b border-[#311718] grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 px-3 py-1 shrink-0"
        style={{ WebkitAppRegion: 'drag', ...(isMac ? {paddingLeft:90, fontFamily:'-apple-system, BlinkMacSystemFont, sans-serif'} : {}) } as React.CSSProperties}
      >
        <div className="min-w-0 flex flex-wrap items-center justify-between gap-2">
        {/* Left: App title, status, and Project/Repo selector */}
        <div className="cp-deck-workspace min-w-0 flex items-center gap-2 text-[14px]">
          <span
            className={`w-2 h-2 rounded-none ${
              isRunning ? 'bg-yellow-400 animate-ping' : 'bg-cyan-400'
            }`}
          />
          <span className="cp-title text-[16px] text-cp-500">Capri</span>
          <span className="cp-label">// dev</span>
          
          {/* Clickable Project / Repository Selector */}
          <button
            onClick={async () => {
              if (window.api) {
                const dir = await window.api.system.selectDirectory()
                if (dir) {
                  setProjectPath(dir)
                  setSpeech(`Workspace switched to: ${dir.split(/[\\/]/).filter(Boolean).pop()}! Ready to breach, choomba!`, 3500)
                }
              }
            }}
            className="cp-deck-project cp-cut min-w-0 flex items-center gap-1.5 px-2 py-0.5 rounded-none bg-[#271212] hover:bg-[#391b1c] border border-[#472223] text-[13px] text-stone-300 hover:text-white transition-all cursor-pointer group"
            title={t('deck_workspaceTitle', { path: projectPath || t('deck_noFolderSel') })}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <FolderGit2 size={12} className="text-cyan-400 group-hover:scale-110 transition-transform" />
            <span className="truncate max-w-[160px] cp-mono text-[12px] text-stone-200">
              {projectPath ? (projectPath.split(/[\\/]/).filter(Boolean).pop() || projectPath) : t('deck_selectRepo')}
            </span>
            <FolderOpen size={10} className="text-cp-400 opacity-70 group-hover:opacity-100" />
          </button>
        </div>

        {/* Center: Developer Mode only has Code Editor and Chat */}
        <div
          className="cp-deck-tabs flex items-center gap-1 bg-[#210f10] p-0.5 rounded-none border border-[#3c1c1d]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => setActiveTab('chat')}
            aria-pressed={activeTab === 'chat'}
            className={`cp-cut flex items-center gap-1.5 px-3 py-1 rounded-none text-[14px] transition-colors ${
              activeTab === 'chat'
                ? 'bg-[#3c1c1d] text-white font-semibold border border-[#612f30]'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title={t('deck_tabChatTitle')}
          >
            <MessageSquare size={13} className={activeTab === 'chat' ? 'text-cp-400' : 'text-stone-400'} />
            <span>{t('deck_tabChat')}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('editor')
              setSpeech('Watching your code like a hawk, choomba!', 3000)
            }}
            className={`cp-cut flex items-center gap-1.5 px-3 py-1 rounded-none text-[14px] transition-colors ${
              activeTab === 'editor'
                ? 'bg-[#3c1c1d] text-white font-semibold border border-[#612f30]'
                : 'text-stone-400 hover:text-stone-200'
            }`}
            title={t('deck_tabEditor')}
            aria-pressed={activeTab === 'editor'}
          >
            <Code2 size={13} className={activeTab === 'editor' ? 'text-cyan-400' : 'text-stone-400'} />
            <span>{t('deck_tabEditor')}</span>
          </button>
        </div>

        {/* Right: Local Model Selector, Engine Selector & Window Controls */}
        <div
          className="cp-deck-tools min-w-0 flex flex-wrap items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {/* Local Model Selector */}
          {configLoaded && (
            <div
              className="cp-deck-model flex items-center gap-1.5 bg-[#210f10] border border-[#3c1c1d] rounded-none px-2 py-0.5 text-[14px] text-stone-300"
              title={`${cloudModel ? 'Cloud model — change in Settings' : t('deck_modelTitle')} · ${cloudModel || currentModel}`}
              aria-label={`${t('deck_model')}: ${cloudModel || currentModel}`}
            >
              <Cpu size={12} className="text-cyan-400" />
              <span className="text-stone-500 text-[12px] uppercase">{t('deck_model')}:</span>
              <select
                value={cloudModel || currentModel}
                disabled={!!cloudModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className="bg-[#210f10] text-stone-100 font-semibold text-[14px] outline-none cursor-pointer max-w-[180px] truncate"
                style={{ colorScheme: 'dark' }}
              >
                {(cloudModel ? [cloudModel] : modelOptions).map((m) => (
                  <option key={m} value={m} className="bg-[#170a0b] text-stone-200">
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* LLM settings */}
          <button
            type="button"
            onClick={() => openSettings('ai')}
            className="cp-deck-settings flex items-center justify-center bg-[#210f10] border border-[#3c1c1d] rounded-none p-1 text-stone-300 hover:text-stone-100 transition-colors"
            title={isMac ? `${t('deck_settingsTitle')} (⌘,)` : t('deck_settingsTitle')}
            aria-label={t('deck_settingsTitle')}
          >
            <Settings size={14} />
          </button>

          {/* Watch Screen Button */}
          <button
            type="button"
            onClick={async () => {
              if (window.api?.scanner) {
                const next = await window.api.scanner.toggleWatchScreen()
                setIsWatchingScreen(next)
              }
            }}
            className={`cp-cut flex items-center gap-1.5 px-2 py-0.5 rounded-none text-[14px] font-semibold border transition-all cursor-pointer ${
              isWatchingScreen
                ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.4)]'
                : 'border-[#3c1c1d] bg-[#210f10] text-stone-400 hover:text-cyan-300 hover:border-cyan-500/50'
            }`}
            title={isEs ? 'Capri mira tu pantalla completa en vivo y reacciona a juegos o videos' : 'Capri watches your screen live and reacts to games or videos'}
          >
            <Eye size={12} className={isWatchingScreen ? 'text-cyan-300 animate-pulse' : 'text-cyan-400'} />
            <span className="text-[12px] uppercase font-bold text-stone-300">
              {isWatchingScreen ? (isEs ? 'MIRANDO PANTALLA' : 'WATCHING SCREEN') : (isEs ? 'MIRAR PANTALLA' : 'WATCH SCREEN')}
            </span>
          </button>

          {/* User Option: Capri Voice in Dev Mode */}
          <button
            type="button"
            onClick={() => setDevVoiceEnabled(!isDevVoiceEnabled)}
            aria-pressed={isDevVoiceEnabled}
            className={`cp-cut flex items-center gap-1.5 px-2 py-0.5 rounded-none text-[14px] font-semibold border transition-all cursor-pointer ${
              isDevVoiceEnabled
                ? 'bg-[#ff5f57]/20 border-[#ff5f57] text-cp-300'
                : 'bg-[#210f10] border-[#3c1c1d] text-stone-500 hover:text-stone-300'
            }`}
            title={isDevVoiceEnabled ? t('deck_voiceOnTitle') : t('deck_voiceOffTitle')}
          >
            {isDevVoiceEnabled ? (
              <>
                <Volume2 size={12} className="text-[#ff5f57] animate-pulse" />
                <span className="text-[12px] uppercase font-bold text-cp-200">{t('deck_voiceOn')}</span>
              </>
            ) : (
              <>
                <VolumeX size={12} className="text-stone-500" />
                <span className="text-[12px] uppercase text-stone-500">{t('deck_voiceOff')}</span>
              </>
            )}
          </button>

        </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            style={isMac ? {display:'none'} : undefined}
            onClick={handleMinimize}
            className="p-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded-none transition-colors"
            title={t('deck_minimize')}
          >
            <Minus size={13} />
          </button>

          <button
            style={isMac ? {display:'none'} : undefined}
            onClick={handleClose}
            className="p-1 text-stone-400 hover:text-red-400 hover:bg-red-950/40 rounded-none transition-colors"
            title={t('close')}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Main Workspace Panels (Only Code Editor and Full-Screen Chat) */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === 'chat' && <CapriCommandCenter />}
        {activeTab === 'editor' && <CodeEditorView />}
      </div>

      {isMac && <div className="cp-deck-footer h-9 shrink-0 border-t border-[#381a1b] flex items-center justify-between px-4"><span className="cp-label">Apple Silicon</span><button className="cp-btn-ghost text-sm" aria-pressed={isSettingsOpen} title="Settings (⌘,)" onClick={() => openSettings('ai')}>Settings</button></div>}

      {/* Settings: AI, voice, language, apps, supporters (and Mac on a Mac) */}
      <SettingsHub
        isOpen={isSettingsOpen && configLoaded}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        onClose={() => setIsSettingsOpen(false)}
        isMac={isMac}
        onSaved={() => setSettingsRevision((value) => value + 1)}
      />
    </div>
  )
}

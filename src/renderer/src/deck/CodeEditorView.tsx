import { localizeLine } from '../../../shared/lines'
import { getLineLanguage } from '../utils/lineLanguage'
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useT } from '../utils/useUiLang'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { python } from '@codemirror/lang-python'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { useCompanionStore } from '../stores/useCompanionStore'
import { useAgentStore } from '../stores/useAgentStore'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  FileImage,
  File as FileIcon,
  RotateCw,
  Save,
  Copy,
  CheckCircle,
  X,
  Send,
  Sparkles,
  Bug,
  Lightbulb,
  PanelRightClose,
  PanelRightOpen,
  Code2
} from 'lucide-react'
import ojos2Video from '../assets/ojos2.mp4'
import ojosWebp from '../assets/capri/ojos/ojos.webp'
import { speakDevVoice, speakDevAck, stopDevVoice } from '../utils/devVoice'
import { MicButton } from './MicButton'

interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

interface OpenTab {
  path: string
  content: string
  saved: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// File type helpers

const ext = (p: string) => (p.split('.').pop() || '').toLowerCase()

function fileIcon(name: string): React.ReactNode {
  const e = ext(name)
  if (['ts', 'tsx'].includes(e)) return <FileCode size={13} className="text-sky-400 shrink-0" />
  if (['js', 'jsx', 'mjs', 'cjs'].includes(e)) return <FileCode size={13} className="text-yellow-300 shrink-0" />
  if (['html', 'htm'].includes(e)) return <FileCode size={13} className="text-orange-400 shrink-0" />
  if (['css', 'scss'].includes(e)) return <FileCode size={13} className="text-blue-400 shrink-0" />
  if (['py'].includes(e)) return <FileCode size={13} className="text-cyan-400 shrink-0" />
  if (['lua', 'cs', 'rs', 'go', 'java', 'cpp', 'c', 'h'].includes(e)) return <FileCode size={13} className="text-violet-400 shrink-0" />
  if (['json'].includes(e)) return <FileJson size={13} className="text-yellow-300 shrink-0" />
  if (['md', 'txt', 'yml', 'yaml', 'toml', 'env', 'log'].includes(e)) return <FileText size={13} className="text-stone-400 shrink-0" />
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico'].includes(e)) return <FileImage size={13} className="text-cp-400 shrink-0" />
  return <FileIcon size={13} className="text-stone-500 shrink-0" />
}

function languageFor(path: string) {
  const e = ext(path)
  if (['ts', 'tsx'].includes(e)) return [javascript({ typescript: true, jsx: e === 'tsx' })]
  if (['js', 'jsx', 'mjs', 'cjs'].includes(e)) return [javascript({ jsx: e === 'jsx' })]
  if (['html', 'htm'].includes(e)) return [html()]
  if (['css', 'scss'].includes(e)) return [css()]
  if (e === 'json') return [json()]
  if (e === 'py') return [python()]
  if (e === 'md') return [markdown()]
  return []
}

const LANGUAGE_LABEL: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React', mjs: 'JavaScript',
  html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'SCSS', json: 'JSON', py: 'Python', md: 'Markdown', lua: 'Lua'
}

const BINARY = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'mp3', 'mp4', 'wav', 'webm', 'pt', 'zip', 'exe', 'dll', 'pdf', 'sqlite3', 'db'])

const editorTheme = Prec.highest(EditorView.theme({
  '&': { height: '100%', fontSize: '12.5px', backgroundColor: '#0b0708' },
  '.cm-content': { backgroundColor: '#0b0708' },
  '.cm-scroller': { fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace', lineHeight: '1.6' },
  '.cm-gutters': { backgroundColor: '#110a0b', borderRight: '1px solid #3a1a1a', color: '#4b5263' },
  '.cm-activeLine': { backgroundColor: '#1c0e0f' },
  '.cm-activeLineGutter': { backgroundColor: '#1c0e0f', color: '#a1a1aa' }
}, { dark: true }))

// File tree

const TreeNode: React.FC<{
  entry: DirEntry
  depth: number
  activePath: string | null
  expanded: Set<string>
  childrenOf: Record<string, DirEntry[]>
  onToggle: (dir: string) => void
  onOpen: (file: string) => void
}> = ({ entry, depth, activePath, expanded, childrenOf, onToggle, onOpen }) => {
  const isOpen = entry.isDir && expanded.has(entry.path)
  const isActive = !entry.isDir && activePath === entry.path
  return (
    <>
      <button
        onClick={() => (entry.isDir ? onToggle(entry.path) : onOpen(entry.path))}
        className={`cp-plain w-full flex items-center gap-1.5 pr-2 py-[3px] text-left text-[14px] rounded-none cursor-pointer transition-colors ${
          isActive ? 'bg-[#35191a] text-stone-100' : 'text-stone-400 hover:bg-[#271212] hover:text-stone-200'
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
        title={entry.path}
      >
        {entry.isDir ? (
          <>
            {isOpen ? <ChevronDown size={12} className="text-stone-500 shrink-0" /> : <ChevronRight size={12} className="text-stone-500 shrink-0" />}
            {isOpen ? <FolderOpen size={13} className="text-yellow-400/90 shrink-0" /> : <Folder size={13} className="text-yellow-400/80 shrink-0" />}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            {fileIcon(entry.name)}
          </>
        )}
        <span className={`truncate ${entry.isDir ? 'text-stone-300' : ''}`}>{entry.name}</span>
      </button>
      {isOpen && (
        <div className="relative">
          <span className="absolute top-0 bottom-0 border-l border-[#391b1c]" style={{ left: 12 + depth * 14 }} />
          {(childrenOf[entry.path] || []).map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              activePath={activePath}
              expanded={expanded}
              childrenOf={childrenOf}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
          {childrenOf[entry.path] && childrenOf[entry.path].length === 0 && (
            <div className="text-[13px] text-stone-600 italic py-0.5" style={{ paddingLeft: 26 + (depth + 1) * 14 }}>
              empty
            </div>
          )}
        </div>
      )}
    </>
  )
}

// Editor view

export const CodeEditorView: React.FC = () => {
  const tr = useT()
  const { setSpeech } = useCompanionStore()
  const { isRunning, projectPath, setProjectPath, isDevVoiceEnabled } = useAgentStore()
  const root = projectPath

  // Tree
  const [childrenOf, setChildrenOf] = useState<Record<string, DirEntry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [isLoadingTree, setIsLoadingTree] = useState(false)

  // Tabs
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const activeTab = tabs.find((t) => t.path === activePath) || null
  const [copied, setCopied] = useState(false)

  // Capri side panel
  const [showCapri, setShowCapri] = useState(true)
  const [inputPrompt, setInputPrompt] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadDir = useCallback(
    async (relDir: string) => {
      if (!window.api?.system?.listDir) return
      const entries = await window.api.system.listDir(root, relDir)
      setChildrenOf((prev) => ({ ...prev, [relDir]: entries || [] }))
    },
    [root]
  )

  const refreshTree = useCallback(async () => {
    setIsLoadingTree(true)
    setChildrenOf({})
    try {
      await loadDir('')
      for (const dir of expanded) await loadDir(dir)
    } finally {
      setIsLoadingTree(false)
    }
  }, [loadDir, expanded])

  // New workspace: reset tree and tabs
  useEffect(() => {
    setExpanded(new Set())
    setTabs([])
    setActivePath(null)
    setChildrenOf({})
    setIsLoadingTree(true)
    if (!root) {
      setIsLoadingTree(false)
      return
    }
    loadDir('').finally(() => setIsLoadingTree(false))
  }, [root, loadDir])

  useEffect(() => () => stopDevVoice(), [])

  const toggleDir = (dir: string) => {
    const opening = !expanded.has(dir)
    if (opening && !childrenOf[dir]) loadDir(dir)
    setExpanded((prev) => {
      const next = new Set(prev)
      if (opening) next.add(dir)
      else next.delete(dir)
      return next
    })
  }

  const openFile = async (relPath: string) => {
    if (tabs.some((t) => t.path === relPath)) {
      setActivePath(relPath)
      return
    }
    let content: string
    if (BINARY.has(ext(relPath))) {
      content = `// ${relPath} is a binary file and can't be edited here.`
    } else {
      content = (await window.api?.system?.readFile(root, relPath)) ?? ''
    }
    setTabs((prev) => [...prev, { path: relPath, content, saved: content }])
    setActivePath(relPath)
  }

  const closeTab = (relPath: string) => {
    const idx = tabs.findIndex((t) => t.path === relPath)
    const next = tabs.filter((t) => t.path !== relPath)
    setTabs(next)
    if (activePath === relPath) {
      const fallback = next[Math.max(0, idx - 1)]
      setActivePath(fallback ? fallback.path : null)
    }
  }

  const updateContent = (value: string) => {
    if (!activePath) return
    setTabs((prev) => prev.map((t) => (t.path === activePath ? { ...t, content: value } : t)))
  }

  const handleSave = useCallback(async () => {
    if (!activeTab || BINARY.has(ext(activeTab.path)) || !window.api?.system?.writeFile) return
    const ok = await window.api.system.writeFile(root, activeTab.path, activeTab.content)
    if (ok) {
      setTabs((prev) => prev.map((t) => (t.path === activeTab.path ? { ...t, saved: t.content } : t)))
      setSpeech(`Saved ${activeTab.path.split('/').pop()}!`, 2000)
    }
  }, [activeTab, root, setSpeech])

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleSave])

  const handleSelectProject = async () => {
    const dir = await window.api?.system?.selectDirectory()
    if (dir) setProjectPath(dir)
  }

  const handleCopy = () => {
    if (!activeTab) return
    navigator.clipboard.writeText(activeTab.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Capri assistant (code-aware chat)

  useEffect(() => {
    if (!window.api?.agent?.onEvent) return
    const unsub = window.api.agent.onEvent((event) => {
      if (event.type === 'assistant.delta') {
        const text = event.text || ''
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant') return [...prev.slice(0, -1), { ...last, content: last.content + text }]
          return [...prev, { id: `ai-${Date.now()}`, role: 'assistant', content: text }]
        })
      } else if (event.type === 'session.finished' && !event.cancelled && document.hasFocus()) {
        setMessages((current) => {
          const last = current[current.length - 1]
          if (last && last.role === 'assistant' && last.content && useAgentStore.getState().isDevVoiceEnabled) speakDevVoice(last.content)
          return current
        })
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputPrompt).trim()
    if (!textToSend || isRunning) return
    if (isDevVoiceEnabled) speakDevAck()

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: textToSend },
      { id: `ai-${Date.now()}`, role: 'assistant', content: '' }
    ])
    setInputPrompt('')

    const context = activeTab
      ? `[Context: Active file "${activeTab.path}"]\n\`\`\`\n${activeTab.content.slice(0, 3500)}\n\`\`\`\n\n`
      : ''
    await window.api?.agent?.sendPrompt(`${context}User instruction: ${textToSend}`, root, undefined, 'editor')
  }

  const quickAction = (type: 'explain' | 'bugs' | 'refactor') => {
    if (!activeTab) return
    const name = activeTab.path
    const prompts = {
      explain: `Explain what ${name} does, step by step.`,
      bugs: `Review ${name} for bugs, edge cases, null checks, race conditions and security issues.`,
      refactor: `Refactor ${name} to be cleaner and more modern, and show the improved version.`
    }
    // Capri answers in the language she's asked in
    handleSendMessage(localizeLine(prompts[type], getLineLanguage()))
  }

  const rootEntries = childrenOf[''] || []
  const workspaceName = useMemo(() => !root ? tr('ed_noFolder') : root.split(/[\\/]/).filter(Boolean).pop() || root, [root, tr])
  const lineCount = activeTab ? activeTab.content.split('\n').length : 0
  const isDirty = !!activeTab && activeTab.content !== activeTab.saved

  return (
    <div className="flex-1 flex w-full h-full bg-[#120808] overflow-hidden select-none divide-x divide-[#311718]">
      <aside className="w-60 bg-[#15090a] flex flex-col shrink-0 overflow-hidden">
        <div className="h-9 px-3 flex items-center justify-between border-b border-[#311718]">
          <button
            onClick={handleSelectProject}
            className="flex items-center gap-1.5 text-[13px] font-semibold text-stone-300 hover:text-white uppercase tracking-wider truncate cursor-pointer"
            title={tr('ed_openAnotherTitle', { path: root })}
          >
            <FolderOpen size={13} className="text-cyan-400 shrink-0" />
            <span className="truncate">{workspaceName}</span>
          </button>
          <button
            onClick={refreshTree}
            className="p-1 text-stone-500 hover:text-stone-200 rounded-none hover:bg-[#2a1314] cursor-pointer"
            title={tr('ed_refresh')}
          >
            <RotateCw size={12} className={isLoadingTree ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1 px-1">
          {!root ? (
            <div className="p-4 text-[13px] text-stone-500 text-center leading-relaxed">
              {tr('ed_noneOpen')}
              <button onClick={handleSelectProject} className="block mx-auto mt-2 text-cyan-400 hover:text-cyan-300 cursor-pointer">
                {tr('ed_openFolder')}
              </button>
            </div>
          ) : isLoadingTree && rootEntries.length === 0 ? (
            <div className="p-4 text-[13px] text-stone-500 text-center">{tr('ed_loading')}</div>
          ) : rootEntries.length === 0 ? (
            <div className="p-4 text-[13px] text-stone-500 text-center leading-relaxed">
              {tr('ed_empty')}
              <button onClick={handleSelectProject} className="block mx-auto mt-2 text-cyan-400 hover:text-cyan-300 cursor-pointer">
                {tr('ed_openAnother')}
              </button>
            </div>
          ) : (
            rootEntries.map((e) => (
              <TreeNode
                key={e.path}
                entry={e}
                depth={0}
                  activePath={activePath}
                expanded={expanded}
                childrenOf={childrenOf}
                onToggle={toggleDir}
                onOpen={openFile}
              />
            ))
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tabs */}
        <div className="h-9 bg-[#15090a] border-b border-[#311718] flex items-stretch overflow-x-auto shrink-0">
          {tabs.map((t) => {
            const active = t.path === activePath
            const dirty = t.content !== t.saved
            return (
              <div
                key={t.path}
                onClick={() => setActivePath(t.path)}
                onMouseDown={(e) => e.button === 1 && closeTab(t.path)}
                className={`group flex items-center gap-1.5 pl-3 pr-1.5 text-[14px] border-r border-[#311718] cursor-pointer whitespace-nowrap ${
                  active ? 'bg-[#120808] text-stone-100 border-t-2 border-t-cp-500' : 'text-stone-500 hover:text-stone-300 border-t-2 border-t-transparent'
                }`}
                title={t.path}
              >
                {fileIcon(t.path)}
                <span>{t.path.split('/').pop()}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(t.path)
                  }}
                  className="cp-plain w-4 h-4 flex items-center justify-center rounded-none hover:bg-[#391b1c] cursor-pointer"
                  title={tr('close')}
                >
                  {dirty ? (
                    <span className="w-2 h-2 rounded-none bg-stone-300 group-hover:hidden" />
                  ) : null}
                  <X size={11} className={dirty ? 'hidden group-hover:block' : 'opacity-0 group-hover:opacity-100'} />
                </button>
              </div>
            )
          })}
          <div className="flex-1" />
          <div className="flex items-center gap-1 px-2 shrink-0">
            {activeTab && (
              <>
                <button
                  onClick={handleSave}
                  disabled={!isDirty}
                  className="flex items-center gap-1 text-[13px] px-2 py-1 rounded-none text-stone-400 hover:text-white hover:bg-[#2a1314] disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                  title={tr('ed_saveTitle')}
                >
                  <Save size={12} />
                  <span>{tr('ed_save')}</span>
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[13px] px-2 py-1 rounded-none text-stone-400 hover:text-white hover:bg-[#2a1314] cursor-pointer"
                  title={tr('ed_copy')}
                >
                  {copied ? <CheckCircle size={12} className="text-cyan-400" /> : <Copy size={12} />}
                </button>
              </>
            )}
            <button
              onClick={() => setShowCapri(!showCapri)}
              className="p-1 rounded-none text-stone-400 hover:text-white hover:bg-[#2a1314] cursor-pointer"
              title={showCapri ? tr('ed_hidePanel') : tr('ed_showPanel')}
            >
              {showCapri ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        {activeTab && (
          <div className="h-6 px-3 flex items-center gap-1 text-[13px] text-stone-500 border-b border-[#251112] shrink-0 truncate">
            {activeTab.path.split('/').map((part, i, arr) => (
              <React.Fragment key={i}>
                <span className={i === arr.length - 1 ? 'text-stone-300' : ''}>{part}</span>
                {i < arr.length - 1 && <ChevronRight size={10} className="text-stone-600" />}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Code */}
        <div className="flex-1 overflow-hidden select-text">
          {activeTab ? (
            <CodeMirror
              key={activeTab.path}
              value={activeTab.content}
              onChange={updateContent}
              theme={oneDark}
              extensions={[...languageFor(activeTab.path), editorTheme]}
              height="100%"
              style={{ height: '100%' }}
              readOnly={BINARY.has(ext(activeTab.path))}
              basicSetup={{ foldGutter: true, highlightActiveLine: true, bracketMatching: true, autocompletion: true }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-stone-600 gap-2">
              <Code2 size={36} className="text-stone-700" />
              <span className="text-[14px]">{tr('ed_pick')}</span>
              <span className="text-[13px] text-stone-700">{tr('ed_shortcuts')}</span>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="h-6 bg-[#15090a] border-t border-[#311718] px-3 flex items-center justify-between text-[12px] text-stone-500 shrink-0">
          <span className="truncate">{root}</span>
          {activeTab && (
            <span className="flex items-center gap-3 shrink-0">
              {isDirty && <span className="text-yellow-400">{tr('ed_unsaved')}</span>}
              <span>{tr('ed_lines', { n: lineCount })}</span>
              <span>{LANGUAGE_LABEL[ext(activeTab.path)] || tr('ed_plain')}</span>
            </span>
          )}
        </div>
      </section>

      {showCapri && (
        <aside className="w-80 bg-[#15090a] flex flex-col shrink-0 overflow-hidden">
          <div className="relative h-32 shrink-0 overflow-hidden border-b border-[#311718]">
            <video src={ojos2Video} poster={ojosWebp} autoPlay loop muted playsInline className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#15090a] via-transparent to-transparent" />
            <span className="absolute bottom-2 left-3 text-[13px] font-semibold text-stone-200">Capri</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-[14px]">
            {messages.length === 0 && (
              <div className="text-stone-500 text-[13px] leading-relaxed">
                {tr('ed_chatEmpty')}
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`px-2.5 py-2 rounded-none leading-relaxed whitespace-pre-wrap select-text ${
                  m.role === 'user' ? 'bg-[#2b1415] border border-cp-500/20 text-cp-100 ml-6' : 'bg-[#200f0f] border border-[#391b1c] text-stone-300 mr-2'
                }`}
              >
                {m.content || (isRunning ? tr('ed_thinking') : '')}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="px-3 pt-2 flex gap-1.5 border-t border-[#311718]">
            {(
              [
                ['explain', tr('ed_explain'), <Lightbulb size={11} key="i" />],
                ['bugs', tr('ed_bugs'), <Bug size={11} key="i" />],
                ['refactor', tr('ed_refactor'), <Sparkles size={11} key="i" />]
              ] as const
            ).map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => quickAction(key)}
                disabled={isRunning || !activeTab}
                className="flex items-center gap-1 px-2 py-1 rounded-none bg-[#271212] hover:bg-[#36191a] border border-[#411f20] text-[13px] text-stone-300 disabled:opacity-40 cursor-pointer"
                title={activeTab ? `${label} ${activeTab.path}` : tr('ed_openFirst')}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="p-3">
            <div className="flex items-center gap-1 bg-[#210f10] border border-[#3c1c1d] rounded-none px-2 py-1.5 focus-within:border-cp-500 transition-colors">
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder={activeTab ? tr('ed_askAbout', { file: activeTab.path.split('/').pop() || '' }) : tr('ed_askCapri')}
                disabled={isRunning}
                className="flex-1 bg-transparent text-[14px] text-stone-100 placeholder-stone-600 outline-none select-text"
              />
              <MicButton
                onText={(text) => {
                  // Capri got busy while you were talking: keep the text in the box instead of losing it
                  if (useAgentStore.getState().isRunning) setInputPrompt(text)
                  else handleSendMessage(text)
                }}
                disabled={isRunning}
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isRunning || !inputPrompt.trim()}
                className="p-1 rounded-none bg-cp-600 hover:bg-cp-500 disabled:opacity-30 text-white cursor-pointer"
                title={tr('send')}
              >
                <Send size={12} />
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  )
}

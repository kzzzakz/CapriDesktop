import React, { useState, useEffect, useRef, useCallback } from 'react'
import capriFrameImg from '../assets/capri_frame.png'
import {
  ScannerBounds,
  ScannerScanResult,
  ScannerEventPayload,
  WatchPartyStatusPayload
} from '../../../main/ipc/channels'
import { useUiLang, UiLang } from '../utils/useUiLang'

type ResizeDirection = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

const SCANNER_I18N: Record<string, Record<UiLang, string>> = {
  watchTitle: {
    es: 'CAPRI // MIRANDO PANTALLA EN VIVO',
    en: 'CAPRI // LIVE SCREEN WATCH',
    pt: 'CAPRI // OBSERVANDO A TELA AO VIVO',
    fr: 'CAPRI // REGARD SUR L\'ÉCRAN EN DIRECT',
    de: 'CAPRI // BILDSCHIRM LIVE BEOBACHTUNG',
    it: 'CAPRI // OSSERVAZIONE SCHERMO IN DIRETTA',
    ru: 'CAPRI // НАБЛЮДЕНИЕ ЗА ЭКРАНОМ',
    ja: 'CAPRI // 画面ライブ監視',
    ko: 'CAPRI // 화면 실시간 관찰',
    zh: 'CAPRI // 实时屏幕观察'
  },
  watchTiktok: {
    es: 'CAPRI // MIRANDO TIKTOK',
    en: 'CAPRI // WATCHING TIKTOK',
    pt: 'CAPRI // ASSISTINDO TIKTOK',
    fr: 'CAPRI // REGARD SUR TIKTOK',
    de: 'CAPRI // TIKTOK BEOBACHTUNG',
    it: 'CAPRI // GUARDANDO TIKTOK',
    ru: 'CAPRI // СМОТРИТ TIKTOK',
    ja: 'CAPRI // TIKTOKを視聴中',
    ko: 'CAPRI // 틱톡 시청 중',
    zh: 'CAPRI // 正在观看 TIKTOK'
  },
  watchYoutube: {
    es: 'CAPRI // YOUTUBE CO-BROWSING',
    en: 'CAPRI // YOUTUBE CO-BROWSING',
    pt: 'CAPRI // YOUTUBE CO-BROWSING',
    fr: 'CAPRI // YOUTUBE CO-BROWSING',
    de: 'CAPRI // YOUTUBE CO-BROWSING',
    it: 'CAPRI // YOUTUBE CO-BROWSING',
    ru: 'CAPRI // YOUTUBE CO-BROWSING',
    ja: 'CAPRI // YOUTUBE 共同閲覧',
    ko: 'CAPRI // 유튜브 함께 보기',
    zh: 'CAPRI // YOUTUBE 共同浏览'
  },
  watchGaming: {
    es: 'CAPRI // GAMEPLAY EN VIVO',
    en: 'CAPRI // LIVE GAMEPLAY',
    pt: 'CAPRI // GAMEPLAY AO VIVO',
    fr: 'CAPRI // GAMEPLAY EN DIRECT',
    de: 'CAPRI // LIVE GAMEPLAY',
    it: 'CAPRI // GAMEPLAY IN DIRETTA',
    ru: 'CAPRI // ГЕЙМПЛЕЙ В ЖИВУЮ',
    ja: 'CAPRI // ライブゲーム実況',
    ko: 'CAPRI // 실시간 게임 관찰',
    zh: 'CAPRI // 实时游戏实况'
  },
  nextVideo: {
    es: '▼ SIGUIENTE',
    en: '▼ NEXT',
    pt: '▼ PRÓXIMO',
    fr: '▼ SUIVANT',
    de: '▼ NÄCHSTES',
    it: '▼ SUCCESSIVO',
    ru: '▼ СЛЕДУЮЩЕЕ',
    ja: '▼ 次へ',
    ko: '▼ 다음',
    zh: '▼ 下一个'
  },
  likeVideo: {
    es: '❤️ LIKE',
    en: '❤️ LIKE',
    pt: '❤️ CURTIR',
    fr: '❤️ LIKE',
    de: '❤️ LIKE',
    it: '❤️ MI PIACE',
    ru: '❤️ ЛАЙК',
    ja: '❤️ いいね',
    ko: '❤️ 좋아요',
    zh: '❤️ 点赞'
  },
  observing: {
    es: 'OBSERVANDO',
    en: 'OBSERVING',
    pt: 'OBSERVANDO',
    fr: 'OBSERVATION',
    de: 'BEOBACHTUNG',
    it: 'OSSERVAZIONE',
    ru: 'НАБЛЮДЕНИЕ',
    ja: '観察中',
    ko: '관찰 중',
    zh: '观察中'
  },
  stop: {
    es: '✕ DETENER',
    en: '✕ STOP',
    pt: '✕ PARAR',
    fr: '✕ ARRÊTER',
    de: '✕ STOPP',
    it: '✕ FERMA',
    ru: '✕ СТОП',
    ja: '✕ 停止',
    ko: '✕ 정지',
    zh: '✕ 停止'
  },
  feedTelemetry: {
    es: 'PANTALLA PRINCIPAL // SEÑAL ÓPTICA EN VIVO',
    en: 'PRIMARY DISPLAY // LIVE OPTICAL FEED',
    pt: 'TELA PRINCIPAL // SINAL ÓPTICO AO VIVO',
    fr: 'ÉCRAN PRINCIPAL // FLUX OPTIQUE EN DIRECT',
    de: 'HAUPTBILDSCHIRM // LIVE OPTISCHER FEED',
    it: 'SCHERMO PRINCIPALE // FEED OTTICO IN DIRETTA',
    ru: 'ОСНОВНОЙ ЭКРАН // ЖИВОЙ ОПТИЧЕСКИЙ СИГНАЛ',
    ja: 'メインディスプレイ // ライブ光学フィード',
    ko: '기본 디스플레이 // 실시간 광학 피드',
    zh: '主显示器 // 实时光学信号'
  },
  scannerTitle: {
    es: 'CAPRI // ESCÁNER NEURAL',
    en: 'CAPRI // NEURAL SCANNER',
    pt: 'CAPRI // ESCÂNER NEURAL',
    fr: 'CAPRI // SCANNER NEURONAL',
    de: 'CAPRI // NEURALER SCANNER',
    it: 'CAPRI // SCANNER NEURALE',
    ru: 'CAPRI // НЕЙРОСКАНЕР',
    ja: 'CAPRI // ニューラルスキャナー',
    ko: 'CAPRI // 신경 스캐너',
    zh: 'CAPRI // 神经网络扫描仪'
  },
  scan: {
    es: 'ESCANEAR',
    en: 'SCAN',
    pt: 'ESCANEAR',
    fr: 'SCANNER',
    de: 'SCANNEN',
    it: 'SCANSIONA',
    ru: 'СКАНИРОВАТЬ',
    ja: 'スキャン',
    ko: '스캔',
    zh: '扫描'
  },
  scanning: {
    es: 'ESCANEANDO...',
    en: 'SCANNING...',
    pt: 'ESCANEANDO...',
    fr: 'SCAN EN COURS...',
    de: 'SCANNT...',
    it: 'SCANSIONE...',
    ru: 'СКАНИРОВАНИЕ...',
    ja: 'スキャン中...',
    ko: '스캔 중...',
    zh: '扫描中...'
  },
  liveOn: {
    es: '● AUTO ACTIVO',
    en: '● LIVE ON',
    pt: '● AO VIVO ATIVO',
    fr: '● DIRECT ACTIF',
    de: '● LIVE AN',
    it: '● LIVE ATTIVO',
    ru: '● АВТО ВКЛ',
    ja: '● ライブON',
    ko: '● 라이브 켜짐',
    zh: '● 实时开启'
  },
  liveOff: {
    es: '○ AUTO DESACTIVADO',
    en: '○ LIVE OFF',
    pt: '○ AO VIVO INATIVO',
    fr: '○ DIRECT INACTIF',
    de: '○ LIVE AUS',
    it: '○ LIVE SPENTO',
    ru: '○ АВТО ВЫКЛ',
    ja: '○ ライブOFF',
    ko: '○ 라이브 꺼짐',
    zh: '○ 实时关闭'
  },
  target: {
    es: 'OBJETIVO:',
    en: 'TARGET:',
    pt: 'ALVO:',
    fr: 'CIBLE:',
    de: 'ZIEL:',
    it: 'OBIETTIVO:',
    ru: 'ЦЕЛЬ:',
    ja: 'ターゲット:',
    ko: '대상:',
    zh: '目标:'
  },
  close: {
    es: 'Cerrar escáner',
    en: 'Close scanner frame',
    pt: 'Fechar escâner',
    fr: 'Fermer le scanner',
    de: 'Scanner schließen',
    it: 'Chiudi scanner',
    ru: 'Закрыть сканер',
    ja: 'スキャナーを閉じる',
    ko: '스캐너 닫기',
    zh: '关闭扫描仪'
  },
  dragHelp: {
    es: 'Arrastrá para mover el marco (o Ctrl + rueda para redimensionar)',
    en: 'Drag to move scanner frame (or use Ctrl + Wheel to resize)',
    pt: 'Arraste para mover o quadro (ou Ctrl + roda para redimensionar)',
    fr: 'Faites glisser pour déplacer (ou Ctrl + molette pour redimensionner)',
    de: 'Ziehen zum Bewegen (oder Strg + Mausrad zum Skalieren)',
    it: 'Trascina per spostare (o Ctrl + rotella per ridimensionare)',
    ru: 'Перетащите для перемещения (или Ctrl + колесо)',
    ja: 'ドラッグして移動 (Ctrl+ホイールでリサイズ)',
    ko: '드래그하여 이동 (Ctrl+휠로 크기 조절)',
    zh: '拖动以移动 (或 Ctrl+滚轮缩放)'
  },
  watchingScreenTitle: {
    es: 'Capri está mirando tu pantalla y reacciona en tiempo real',
    en: 'Capri is actively watching your screen and reacting in real-time',
    pt: 'Capri está observando sua tela e reagindo em tempo real',
    fr: 'Capri regarde votre écran et réagit en direct',
    de: 'Capri beobachtet deinen Bildschirm live',
    it: 'Capri sta guardando il tuo schermo e reagisce in tempo reale',
    ru: 'Capri наблюдает за экраном и реагирует в реальном времени',
    ja: 'Capriが画面を観察しリアルタイムに反応します',
    ko: 'Capri가 화면을 실시간으로 관찰하고 반응합니다',
    zh: 'Capri正在实时观察屏幕并做出反应'
  },
  glitchTitle: {
    es: 'AVISO DEL ESCÁNER ÓPTICO',
    en: 'OPTICAL SCANNER NOTICE',
    pt: 'AVISO DO ESCÂNER ÓPTICO',
    fr: 'AVIS DU SCANNER OPTIQUE',
    de: 'HINWEIS DES OPTISCHEN SCANNERS',
    it: 'AVVISO DELLO SCANNER OTTICO',
    ru: 'УВЕДОМЛЕНИЕ ОПТИЧЕСКОГО СКАНЕРА',
    ja: '光学スキャナー通知',
    ko: '광학 스캐너 알림',
    zh: '光学扫描仪通知'
  }
}

export const ScannerView: React.FC = () => {
  const lang = useUiLang()
  const tr = useCallback((key: keyof typeof SCANNER_I18N): string => {
    return SCANNER_I18N[key]?.[lang] || SCANNER_I18N[key]?.['en'] || ''
  }, [lang])

  const [isScanning, setIsScanning] = useState(false)
  const [isContinuous, setIsContinuous] = useState(false)
  const [isWatchingScreen, setIsWatchingScreen] = useState(false)
  const [watchPartyState, setWatchPartyState] = useState<WatchPartyStatusPayload | null>(null)
  const [liveReaction, setLiveReaction] = useState<string | null>(null)
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'result' | 'error'>('idle')
  const [scanResult, setScanResult] = useState<ScannerScanResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: window.innerWidth,
    height: window.innerHeight
  })

  // Refs for smooth drag, resize, and hit-testing
  const boundsRef = useRef<ScannerBounds>({
    x: window.screenX,
    y: window.screenY,
    width: window.innerWidth,
    height: window.innerHeight
  })
  const isDraggingRef = useRef(false)
  const lastIgnoreRef = useRef<boolean | null>(null)
  const rafRef = useRef<number | null>(null)
  const pendingBoundsRef = useRef<ScannerBounds | null>(null)
  const resultTimerRef = useRef<NodeJS.Timeout | null>(null)
  const reactionTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Initial status synchronization and IPC event subscriptions
  useEffect(() => {
    // Sync initial status from main process
    window.api.scanner.getStatus().then((status) => {
      setIsScanning(status.isScanning)
      setIsContinuous(status.isContinuous)
      if (typeof status.isWatchingScreen === 'boolean') {
        setIsWatchingScreen(status.isWatchingScreen)
      }
      if (status.bounds) {
        boundsRef.current = { ...status.bounds }
        setDimensions({ width: status.bounds.width, height: status.bounds.height })
      }
    })

    if (window.api.watchParty?.getStatus) {
      window.api.watchParty.getStatus().then((st) => setWatchPartyState(st)).catch(() => {})
    }
    const unsubWatchParty = window.api.watchParty?.onStateChanged?.((st) => {
      setWatchPartyState(st)
    })

    // Listen for scanner events (scanning, result, status, error)
    const unsubscribe = window.api.scanner.onEvent((event: ScannerEventPayload) => {
      if (typeof event.isWatchingScreen === 'boolean') {
        setIsWatchingScreen(event.isWatchingScreen)
      }
      if (event.reaction) {
        setLiveReaction(event.reaction)
        if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current)
        reactionTimerRef.current = setTimeout(() => {
          setLiveReaction(null)
        }, 7500)
      }

      if (event.type === 'scanning') {
        setScanState('scanning')
        setIsScanning(true)
        setErrorMessage(null)
        if (resultTimerRef.current) {
          clearTimeout(resultTimerRef.current)
          resultTimerRef.current = null
        }
      } else if (event.type === 'result') {
        setIsScanning(false)
        setScanState('result')
        if (event.result) {
          setScanResult(event.result)
        }
        // Auto-fade tags after 5.5s
        if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
        resultTimerRef.current = setTimeout(() => {
          setScanState('idle')
        }, 5500)
      } else if (event.type === 'status') {
        if (typeof event.isScanning === 'boolean') setIsScanning(event.isScanning)
        if (typeof event.isContinuous === 'boolean') setIsContinuous(event.isContinuous)
      } else if (event.type === 'error') {
        setIsScanning(false)
        setScanState('error')
        setErrorMessage(event.error || 'Scan failed')
        if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
        resultTimerRef.current = setTimeout(() => {
          setScanState('idle')
          setErrorMessage(null)
        }, 4000)
      }
    })

    return () => {
      unsubscribe()
      if (unsubWatchParty) unsubWatchParty()
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current)
    }
  }, [])

  // Track window size changes
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
      boundsRef.current.width = window.innerWidth
      boundsRef.current.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Batched SetBounds via requestAnimationFrame
  const queueSetBounds = useCallback((nextBounds: ScannerBounds) => {
    pendingBoundsRef.current = nextBounds
    boundsRef.current = nextBounds
    setDimensions({ width: nextBounds.width, height: nextBounds.height })

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (pendingBoundsRef.current) {
          window.api.scanner.setBounds(pendingBoundsRef.current)
          pendingBoundsRef.current = null
        }
      })
    }
  }, [])

  // Click-through Hit-Testing (Forward mouse inside the hole; capture on borders/controls)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isWatchingScreen) {
      const { clientX, clientY } = e
      const w = window.innerWidth
      // Top center badge bounds (allows clicking the STOP button)
      const isOverHeaderBadge = clientY <= 50 && clientX >= w / 2 - 200 && clientX <= w / 2 + 200
      if (isOverHeaderBadge) {
        if (lastIgnoreRef.current !== false) {
          lastIgnoreRef.current = false
          window.api.scanner.setIgnoreMouse(false)
        }
      } else {
        if (lastIgnoreRef.current !== true) {
          lastIgnoreRef.current = true
          window.api.scanner.setIgnoreMouse(true)
        }
      }
      return
    }

    if (isDraggingRef.current) {
      if (lastIgnoreRef.current !== false) {
        lastIgnoreRef.current = false
        window.api.scanner.setIgnoreMouse(false)
      }
      return
    }

    const { clientX, clientY } = e
    const w = window.innerWidth
    const h = window.innerHeight

    // Scanner frame interior hole margins (aligns with backend desktopCapturer crop)
    const isInsideHole =
      clientX >= 46 &&
      clientX <= w - 46 &&
      clientY >= 50 &&
      clientY <= h - 48

    if (isInsideHole) {
      if (lastIgnoreRef.current !== true) {
        lastIgnoreRef.current = true
        window.api.scanner.setIgnoreMouse(true)
      }
    } else {
      if (lastIgnoreRef.current !== false) {
        lastIgnoreRef.current = false
        window.api.scanner.setIgnoreMouse(false)
      }
    }
  }, [isWatchingScreen])

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    // On Linux, turning click-through on is reported as the mouse leaving, right where it still is.
    // Answering that would turn it off and on again forever.
    const stillOver = e.clientX > 0 && e.clientY > 0 && e.clientX < window.innerWidth - 1 && e.clientY < window.innerHeight - 1
    if (lastIgnoreRef.current && stillOver && navigator.userAgent.includes('Linux')) return

    if (lastIgnoreRef.current !== false) {
      lastIgnoreRef.current = false
      window.api.scanner.setIgnoreMouse(false)
    }
  }, [])

  // Drag and Resize Handler
  const startDrag = useCallback(
    (direction: ResizeDirection, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      isDraggingRef.current = true
      if (lastIgnoreRef.current !== false) {
        lastIgnoreRef.current = false
        window.api.scanner.setIgnoreMouse(false)
      }

      const startMouseX = e.screenX
      const startMouseY = e.screenY
      const startBounds = { ...boundsRef.current }

      const onMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.screenX - startMouseX
        const deltaY = moveEvent.screenY - startMouseY

        let nextX = startBounds.x
        let nextY = startBounds.y
        let nextW = startBounds.width
        let nextH = startBounds.height

        const MIN_W = 260
        const MIN_H = 220

        if (direction === 'move') {
          nextX = startBounds.x + deltaX
          nextY = startBounds.y + deltaY
        } else {
          // Horizontal adjustments
          if (direction.includes('e')) {
            nextW = Math.max(MIN_W, startBounds.width + deltaX)
          } else if (direction.includes('w')) {
            const rawW = startBounds.width - deltaX
            nextW = Math.max(MIN_W, rawW)
            nextX = startBounds.x + (startBounds.width - nextW)
          }

          // Vertical adjustments
          if (direction.includes('s')) {
            nextH = Math.max(MIN_H, startBounds.height + deltaY)
          } else if (direction.includes('n')) {
            const rawH = startBounds.height - deltaY
            nextH = Math.max(MIN_H, rawH)
            nextY = startBounds.y + (startBounds.height - nextH)
          }
        }

        queueSetBounds({
          x: Math.round(nextX),
          y: Math.round(nextY),
          width: Math.round(nextW),
          height: Math.round(nextH)
        })
      }

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
        isDraggingRef.current = false

        // Ensure final bounds are flushed and saved
        if (pendingBoundsRef.current) {
          window.api.scanner.setBounds(pendingBoundsRef.current)
          pendingBoundsRef.current = null
        }
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [queueSetBounds]
  )

  // Ctrl + Mouse Wheel Zoom Resizing
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()

      const cur = boundsRef.current
      if (!cur.width || !cur.height) return

      // deltaY < 0 = scroll up -> zoom in/enlarge
      // deltaY > 0 = scroll down -> zoom out/shrink
      const step = e.deltaY < 0 ? 32 : -32
      const aspect = cur.width / cur.height
      const nextW = Math.max(260, Math.min(2200, cur.width + step * aspect))
      const nextH = Math.max(220, Math.min(1600, cur.height + step))
      const nextX = cur.x - Math.round((nextW - cur.width) / 2)
      const nextY = cur.y - Math.round((nextH - cur.height) / 2)

      const nextBounds = {
        x: Math.round(nextX),
        y: Math.round(nextY),
        width: Math.round(nextW),
        height: Math.round(nextH)
      }
      queueSetBounds(nextBounds)
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [queueSetBounds])

  // Action Handlers
  const handleTriggerScan = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isScanning) return
    try {
      setIsScanning(true)
      setScanState('scanning')
      await window.api.scanner.scan()
    } catch (err) {
      console.error('[ScannerView] Trigger scan error:', err)
      setIsScanning(false)
    }
  }

  const handleToggleContinuous = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const next = !isContinuous
      setIsContinuous(next)
      await window.api.scanner.setContinuous(next)
    } catch (err) {
      console.error('[ScannerView] Toggle continuous error:', err)
    }
  }

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await window.api.scanner.close()
    } catch (err) {
      console.error('[ScannerView] Close error:', err)
    }
  }

  const handleStopWatchScreen = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      await window.api.scanner.stopWatchScreen()
      setIsWatchingScreen(false)
      setLiveReaction(null)
    } catch (err) {
      console.error('[ScannerView] Stop watch screen error:', err)
    }
  }

  return (
    <div
      className="fixed inset-0 w-full h-full select-none overflow-hidden bg-transparent"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {isWatchingScreen ? (
        /* Full-Screen Live Watch Overlay (Zero disruption to games/videos - Frame only, no laser sweep) */
        <>
          {/* Cybernetic Perimeter Neon Edge & Corners */}
          <div className="absolute inset-0 pointer-events-none border border-cyan-400/40 shadow-[inset_0_0_24px_rgba(0,240,255,0.2)]">
            {/* 4 Glowing Cyber Corner Brackets */}
            <div className="absolute top-2 left-2 w-10 h-10 border-t-2 border-l-2 border-cyan-400 shadow-[0_0_12px_#00f0ff]" />
            <div className="absolute top-2 right-2 w-10 h-10 border-t-2 border-r-2 border-cyan-400 shadow-[0_0_12px_#00f0ff]" />
            <div className="absolute bottom-2 left-2 w-10 h-10 border-b-2 border-l-2 border-cyan-400 shadow-[0_0_12px_#00f0ff]" />
            <div className="absolute bottom-2 right-2 w-10 h-10 border-b-2 border-r-2 border-cyan-400 shadow-[0_0_12px_#00f0ff]" />

            {/* Neon Accent Corner Ticks */}
            <div className="absolute top-4 left-4 w-3 h-3 border-t border-l border-rose-400/80" />
            <div className="absolute top-4 right-4 w-3 h-3 border-t border-r border-rose-400/80" />
            <div className="absolute bottom-4 left-4 w-3 h-3 border-b border-l border-rose-400/80" />
            <div className="absolute bottom-4 right-4 w-3 h-3 border-b border-r border-rose-400/80" />

            {/* Corner Metadata Telemetry */}
            <div className="absolute bottom-3 left-4 font-mono text-[9px] text-cyan-400/70 tracking-wider">
              {tr('feedTelemetry')}
            </div>
          </div>

          {/* Top Center Floating Live Watch Status Badge */}
          <div
            className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#090b14]/92 border border-cyan-400/60 shadow-[0_0_20px_rgba(0,240,255,0.4)] backdrop-blur-md pointer-events-auto"
            title={tr('watchingScreenTitle')}
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="font-mono text-[11px] font-bold text-cyan-300 tracking-wider">
                {watchPartyState?.mode === 'tiktok'
                  ? tr('watchTiktok')
                  : watchPartyState?.mode === 'youtube'
                  ? tr('watchYoutube')
                  : watchPartyState?.mode === 'gaming'
                  ? tr('watchGaming')
                  : tr('watchTitle')}
              </span>
            </div>

            {watchPartyState?.mode === 'tiktok' && (
              <div className="flex items-center gap-1.5 ml-1">
                <button
                  onClick={() => window.api.watchParty?.like?.()}
                  className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/70 text-rose-200 font-mono text-[9px] font-bold transition-all active:scale-95 cursor-pointer"
                >
                  {tr('likeVideo')}
                </button>
                <button
                  onClick={() => window.api.watchParty?.next?.()}
                  className="px-2 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/70 text-cyan-200 font-mono text-[9px] font-bold transition-all active:scale-95 cursor-pointer"
                >
                  {tr('nextVideo')}
                </button>
              </div>
            )}

            {isScanning && (
              <span className="font-mono text-[9px] text-rose-300 bg-rose-950/70 border border-rose-400/50 px-1.5 py-0.5 rounded animate-pulse">
                {tr('observing')}
              </span>
            )}

            <button
              onClick={() => {
                if (watchPartyState?.active) {
                  window.api.watchParty?.stop?.()
                } else {
                  handleStopWatchScreen()
                }
              }}
              className="ml-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/70 text-rose-200 hover:text-white transition-all cursor-pointer shadow-[0_0_8px_rgba(244,63,94,0.35)] active:scale-95"
              title={tr('stop')}
            >
              {tr('stop')}
            </button>
          </div>

          {/* YouTube Co-Browsing Candidate Proposal Bar */}
          {watchPartyState?.mode === 'youtube' && watchPartyState.isBrowsingFeed && watchPartyState.candidateTitle && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-xl bg-[#090b14]/95 border border-cyan-400/70 shadow-[0_0_20px_rgba(0,240,255,0.4)] backdrop-blur-md pointer-events-auto animate-fade-in">
              <span className="font-mono text-[11px] text-white max-w-md truncate">
                ¿Vemos: <strong className="text-cyan-300">&ldquo;{watchPartyState.candidateTitle}&rdquo;</strong>?
              </span>
              <button
                onClick={() => window.api.desktopController?.action('click')}
                className="px-2.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/80 text-emerald-200 font-mono text-[10px] font-bold cursor-pointer active:scale-95 transition-all"
              >
                ✓ SÍ
              </button>
              <button
                onClick={() => window.api.desktopController?.action('scroll', { direction: 'down', amount: 500 })}
                className="px-2.5 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 border border-rose-500/80 text-rose-200 font-mono text-[10px] font-bold cursor-pointer active:scale-95 transition-all"
              >
                ✕ OTRO
              </button>
            </div>
          )}

          {/* Live Reaction Subtitle Overlay at Bottom */}
          {liveReaction && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40 max-w-xl px-5 py-2.5 rounded-xl bg-[#090b14]/95 border border-cyan-400/70 shadow-[0_0_25px_rgba(0,240,255,0.45)] backdrop-blur-md animate-fade-in pointer-events-none text-center">
              <div className="font-mono text-[10px] text-cyan-400 font-bold mb-0.5 tracking-wider">
                CAPRI
              </div>
              <div className="font-mono text-[13px] text-white leading-relaxed font-medium">
                &ldquo;{liveReaction}&rdquo;
              </div>
            </div>
          )}

          {/* Capri Autonomous Cyber Cursor Overlay */}
          {watchPartyState?.cursor?.visible && (
            <div
              className="absolute pointer-events-none z-50 transition-all duration-700 ease-out"
              style={{
                left: `${watchPartyState.cursor.x}px`,
                top: `${watchPartyState.cursor.y}px`,
                transform: 'translate(-4px, -4px)'
              }}
            >
              <div className="relative">
                {/* Cyberpunk Neon Arrow Pointer */}
                <svg
                  width="30"
                  height="30"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="filter drop-shadow-[0_0_10px_#00f0ff] drop-shadow-[0_0_18px_rgba(0,240,255,0.7)]"
                >
                  <path
                    d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z"
                    fill="#00f0ff"
                    stroke="#ffffff"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                </svg>

                {/* Capri Badge Tag */}
                <div className="absolute left-6 -top-1 px-1.5 py-0.5 rounded bg-[#090b14]/95 border border-cyan-400/80 text-[9px] font-mono font-bold text-cyan-300 whitespace-nowrap shadow-[0_0_10px_rgba(0,240,255,0.6)] flex items-center gap-1 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                  CAPRI ⚡
                </div>

                {/* Click Ripple Wave Animation */}
                {watchPartyState.cursor.isClicking && (
                  <div className="absolute -top-3 -left-3 w-12 h-12 rounded-full border-2 border-cyan-400 animate-ping opacity-90" />
                )}

                {/* Scrolling Indicators */}
                {watchPartyState.cursor.isScrolling && (
                  <div className="absolute top-7 left-1 flex flex-col items-center gap-0.5 animate-bounce">
                    <span className="text-[11px] text-cyan-300 font-mono font-bold">▼</span>
                    <span className="text-[9px] text-cyan-400/80 font-mono">▼</span>
                  </div>
                )}

                {/* Target Locked Reticle if pointing at video title */}
                {watchPartyState.cursor.targetLabel && (
                  <div className="absolute -top-9 left-6 px-2.5 py-1 rounded bg-[#090b14]/95 border border-rose-500/90 text-rose-300 text-[10px] font-mono font-semibold max-w-sm truncate shadow-[0_0_14px_rgba(244,63,94,0.7)] animate-fade-in flex items-center gap-1.5">
                    <span className="text-rose-400 font-bold">🎯</span>
                    <span className="truncate">&ldquo;{watchPartyState.cursor.targetLabel}&rdquo;</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Regular Regional Scanner Frame UI */
        <>
          {/* 9-Slice Capri Frame Border Layer */}
          <div
            className="absolute inset-0 pointer-events-none transition-all duration-150"
            style={{
              borderStyle: 'solid',
              borderWidth: '48px 45px 48px 45px',
              borderImageSource: `url("${capriFrameImg}")`,
              borderImageSlice: '160 150 160 140',
              borderImageRepeat: 'stretch',
              filter: isScanning
                ? 'drop-shadow(0 0 16px rgba(0, 240, 255, 0.75)) drop-shadow(0 0 24px rgba(255, 0, 128, 0.45))'
                : isContinuous
                ? 'drop-shadow(0 0 12px rgba(16, 185, 129, 0.65)) drop-shadow(0 0 4px rgba(0, 240, 255, 0.4))'
                : 'drop-shadow(0 0 10px rgba(0, 240, 255, 0.45))'
            }}
          />

          {/* Cyberpunk Top Header Bar & Control Buttons */}
          <div
            className="absolute top-1 left-11 right-11 h-10 z-30 flex items-center justify-between px-2 bg-[#090b14]/90 border border-cyan-500/40 rounded shadow-[0_0_15px_rgba(0,240,255,0.25)] backdrop-blur-sm cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => startDrag('move', e)}
            title={tr('dragHelp')}
          >
            {/* Left: Drag Handle & Title */}
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex items-center gap-1.5 text-cyan-400 font-mono text-[11px] font-bold tracking-wider">
                <span className="text-cyan-300">☵</span>
                <span className="truncate">{tr('scannerTitle')}</span>
              </div>
              <span className="text-[10px] font-mono text-cyan-500/70 border border-cyan-500/30 px-1 py-0.2 rounded bg-cyan-950/30">
                {dimensions.width}×{dimensions.height}
              </span>
            </div>

            {/* Right: Scan, Continuous, & Close Buttons */}
            <div className="flex items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
              {/* Scan Button */}
              <button
                onClick={handleTriggerScan}
                disabled={isScanning}
                className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold tracking-wide transition-all duration-200 flex items-center gap-1 cursor-pointer ${
                  isScanning
                    ? 'bg-rose-950/80 border border-rose-400 text-rose-300 animate-pulse shadow-[0_0_12px_rgba(244,63,94,0.5)]'
                    : 'bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-400 text-cyan-300 hover:text-white shadow-[0_0_10px_rgba(0,240,255,0.35)] active:scale-95'
                }`}
                title={tr('scan')}
              >
                <span className="text-xs">{isScanning ? '⏳' : '⚡'}</span>
                <span>{isScanning ? tr('scanning') : tr('scan')}</span>
              </button>

              {/* Continuous Mode Toggle */}
              <button
                onClick={handleToggleContinuous}
                className={`px-2 py-1 rounded font-mono text-[10px] font-semibold tracking-wide transition-all duration-200 border cursor-pointer ${
                  isContinuous
                    ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                    : 'bg-slate-900/80 hover:bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title={isContinuous ? tr('liveOn') : tr('liveOff')}
              >
                {isContinuous ? tr('liveOn') : tr('liveOff')}
              </button>

              {/* Close Button */}
              <button
                onClick={handleClose}
                className="w-6 h-6 flex items-center justify-center rounded font-mono text-xs font-bold text-slate-400 hover:text-rose-300 bg-slate-900/80 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-500 transition-colors cursor-pointer"
                title={tr('close')}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Frame Decorative Edge Drag Areas (Dragging border moves frame) */}
          <div
            className="absolute top-0 left-12 right-12 h-11 z-20 cursor-move"
            onMouseDown={(e) => startDrag('move', e)}
          />
          <div
            className="absolute bottom-0 left-12 right-12 h-11 z-20 cursor-move"
            onMouseDown={(e) => startDrag('move', e)}
          />
          <div
            className="absolute left-0 top-12 bottom-12 w-11 z-20 cursor-move"
            onMouseDown={(e) => startDrag('move', e)}
          />
          <div
            className="absolute right-0 top-12 bottom-12 w-11 z-20 cursor-move"
            onMouseDown={(e) => startDrag('move', e)}
          />

          {/* 8 Resize Handles */}
          {/* Corners */}
          <div
            className="absolute top-0 left-0 w-8 h-8 z-40 cursor-nwse-resize group"
            onMouseDown={(e) => startDrag('nw', e)}
            title="Resize top-left corner"
          >
            <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-cyan-400 opacity-60 group-hover:opacity-100 group-hover:scale-125 transition-all" />
          </div>
          <div
            className="absolute top-0 right-0 w-8 h-8 z-40 cursor-nesw-resize group"
            onMouseDown={(e) => startDrag('ne', e)}
            title="Resize top-right corner"
          >
            <div className="absolute top-1 right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-cyan-400 opacity-60 group-hover:opacity-100 group-hover:scale-125 transition-all" />
          </div>
          <div
            className="absolute bottom-0 left-0 w-8 h-8 z-40 cursor-nesw-resize group"
            onMouseDown={(e) => startDrag('sw', e)}
            title="Resize bottom-left corner"
          >
            <div className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-cyan-400 opacity-60 group-hover:opacity-100 group-hover:scale-125 transition-all" />
          </div>
          <div
            className="absolute bottom-0 right-0 w-8 h-8 z-40 cursor-nwse-resize group"
            onMouseDown={(e) => startDrag('se', e)}
            title="Resize bottom-right corner"
          >
            <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-cyan-400 opacity-60 group-hover:opacity-100 group-hover:scale-125 transition-all" />
          </div>

          {/* Edges */}
          <div
            className="absolute top-0 left-8 right-8 h-2 z-40 cursor-ns-resize"
            onMouseDown={(e) => startDrag('n', e)}
          />
          <div
            className="absolute bottom-0 left-8 right-8 h-2 z-40 cursor-ns-resize"
            onMouseDown={(e) => startDrag('s', e)}
          />
          <div
            className="absolute left-0 top-8 bottom-8 w-2 z-40 cursor-ew-resize"
            onMouseDown={(e) => startDrag('w', e)}
          />
          <div
            className="absolute right-0 top-8 bottom-8 w-2 z-40 cursor-ew-resize"
            onMouseDown={(e) => startDrag('e', e)}
          />

          {/* interior scanning & HUD overlay layer (Always pointer-events-none for click-through) */}
          <div
            className="absolute top-[48px] bottom-[48px] left-[45px] right-[45px] overflow-hidden pointer-events-none z-10"
          >
            {/* Subtle Cyberpunk HUD Corner Brackets in Idle */}
            <div className="absolute top-2 left-2 w-4 h-4 border-t border-l border-cyan-400/40" />
            <div className="absolute top-2 right-2 w-4 h-4 border-t border-r border-cyan-400/40" />
            <div className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-cyan-400/40" />
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-cyan-400/40" />

            {/* Center Reticle Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center opacity-25">
              <div className="w-8 h-8 relative">
                <div className="absolute top-1/2 left-0 right-0 h-px bg-cyan-400" />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-cyan-400" />
                <div className="absolute inset-1 rounded-full border border-cyan-400/50" />
              </div>
            </div>

            {/* Idle / Live Telemetry Indicator */}
            <div className="absolute bottom-2 right-3 font-mono text-[9px] text-cyan-400/60 tracking-wider flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isContinuous ? 'bg-emerald-400 animate-ping' : 'bg-cyan-400/70'}`} />
              <span>{isContinuous ? tr('liveOn') : tr('liveOff')}</span>
            </div>

            {/* result state: Floating Cyberpunk HUD Tags & Summary */}
            {scanState === 'result' && scanResult && (
              <div className="absolute inset-0 flex flex-col justify-between p-3 animate-fade-in">
                {/* Top: Recognized Feature Tags */}
                <div className="flex flex-wrap gap-1.5 max-w-full">
                  {(scanResult.tags || []).map((tag, idx) => (
                    <div
                      key={idx}
                      className="px-2 py-0.5 rounded font-mono text-[10px] font-bold text-cyan-300 bg-[#090b14]/90 border border-cyan-400/70 shadow-[0_0_8px_rgba(0,240,255,0.4)] flex items-center gap-1"
                    >
                      <span className="text-cyan-400 text-[8px]">◈</span>
                      <span>{tag}</span>
                    </div>
                  ))}
                </div>

                {/* Bottom: Target Summary & Capri Reaction Chip */}
                <div className="flex flex-col gap-1 max-w-full">
                  {scanResult.summary && (
                    <div className="font-mono text-[10px] text-slate-200 bg-[#090b14]/90 px-2 py-1 rounded border border-cyan-500/40 shadow-[0_0_10px_rgba(0,240,255,0.25)] flex items-center gap-1.5 truncate">
                      <span className="text-cyan-400 font-bold">{tr('target')}</span>
                      <span className="truncate">{scanResult.summary}</span>
                    </div>
                  )}
                  {scanResult.response && (
                    <div className="font-mono text-[11px] text-emerald-300 bg-[#090b14]/95 px-2.5 py-1.5 rounded border border-emerald-400/60 shadow-[0_0_12px_rgba(16,185,129,0.3)] leading-tight">
                      <span className="text-cyan-400 font-bold mr-1">CAPRI:</span>
                      <span>&ldquo;{scanResult.response}&rdquo;</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* error state: Friendly Warning */}
            {scanState === 'error' && errorMessage && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="bg-[#1a0a14]/95 border border-rose-500/70 text-rose-300 font-mono text-xs px-3 py-2 rounded shadow-[0_0_15px_rgba(244,63,94,0.4)] text-center max-w-md">
                  <div className="font-bold text-rose-400 mb-0.5">⚠️ {tr('glitchTitle')}</div>
                  <div className="text-[11px] leading-snug">{errorMessage}</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default ScannerView

/**
 * Her fixed commands in the languages her detectors don't read directly (they read English and
 * Spanish), turned into the English they do read. Works instantly and with no model, which the
 * translator in voice-service needs: it stays as the fallback for free-form requests.
 *
 * {x} is any text and {w} a single word: "choisis {w}" takes a champion, not "choisis un film".
 */

export type CommandLang = 'fr' | 'de' | 'it' | 'pt' | 'ru' | 'ja' | 'ko' | 'zh'
export const COMMAND_LANGS: CommandLang[] = ['fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh']

type Forms = Record<CommandLang, string[]>

/** Whole sentences, tried before the ones with a free part */
export const FIXED_COMMANDS: Record<string, Forms> = {
  'clip that': {
    fr: ['clippe ça', 'clip ça', 'enregistre ce clip', 'sauvegarde ce clip', 'fais un clip'],
    de: ['clip das', 'clippe das', 'speichere den clip', 'speicher den clip', 'mach einen clip'],
    it: ['clippa questo', 'clippalo', 'salva il clip', 'salva la clip', 'fai una clip'],
    pt: ['clipa isso', 'clipe isso', 'salva o clipe', 'salve o clipe', 'grava esse clipe'],
    ru: ['сделай клип', 'клипни это', 'сохрани клип', 'запиши клип'],
    ja: ['クリップして', 'クリップ保存して', '今のをクリップして'],
    ko: ['클립 따줘', '클립 저장해줘', '방금 거 클립해줘'],
    zh: ['剪辑一下', '保存片段', '录个片段', '把这段存下来']
  },
  'cancel the valorant agent pick': {
    fr: ['annule le pick valorant', 'annule l agent valorant', 'annule le choix d agent valorant'],
    de: ['brich den valorant pick ab', 'valorant pick abbrechen', 'agentenwahl in valorant abbrechen'],
    it: ['annulla il pick di valorant', 'annulla l agente di valorant', 'annulla la scelta dell agente valorant'],
    pt: ['cancela o pick do valorant', 'cancela o agente do valorant', 'cancele o pick do valorant'],
    ru: ['отмени пик в валоранте', 'отмени выбор агента в валоранте', 'отмени пик в valorant'],
    ja: ['ヴァロのピックをキャンセルして', 'valorantのエージェント選択をキャンセルして', 'ヴァロラントのピックをやめて'],
    ko: ['발로란트 픽 취소해줘', '발로 요원 선택 취소해줘', 'valorant 픽 취소해줘'],
    zh: ['取消瓦罗兰特选人', '取消valorant选英雄', '取消无畏契约选人']
  },
  'are you bored?': {
    fr: ['tu t ennuies', 'est ce que tu t ennuies'],
    de: ['ist dir langweilig', 'langweilst du dich'],
    it: ['ti annoi', 'sei annoiata', 'ti stai annoiando'],
    pt: ['voce esta entediada', 'esta entediada', 'ta entediada', 'voce ta entediada'],
    ru: ['тебе скучно'],
    ja: ['退屈してる', '退屈なの', '暇なの'],
    ko: ['심심해', '너 심심해', '심심하니'],
    zh: ['你无聊吗', '无聊吗', '你無聊嗎']
  },
  'list macros': {
    fr: ['liste mes macros', 'montre mes macros', 'mes macros', 'quelles sont mes macros'],
    de: ['zeig meine makros', 'liste meine makros', 'meine makros', 'welche makros habe ich'],
    it: ['elenca le mie macro', 'mostra le mie macro', 'le mie macro', 'quali macro ho'],
    pt: ['lista minhas macros', 'mostra minhas macros', 'minhas macros', 'quais macros eu tenho'],
    ru: ['покажи мои макросы', 'мои макросы', 'список макросов', 'какие у меня макросы'],
    ja: ['マクロを見せて', 'マクロ一覧', '私のマクロ', 'マクロのリスト'],
    ko: ['매크로 보여줘', '내 매크로', '매크로 목록'],
    zh: ['显示我的宏', '我的宏', '列出宏', '宏列表']
  },
  'delete all macros': {
    fr: ['supprime toutes mes macros', 'efface toutes mes macros', 'supprime toutes les macros'],
    de: ['lösche alle makros', 'lösche alle meine makros'],
    it: ['cancella tutte le macro', 'elimina tutte le macro', 'cancella tutte le mie macro'],
    pt: ['apaga todas as macros', 'apaga todas as minhas macros', 'exclui todas as macros'],
    ru: ['удали все макросы', 'удали все мои макросы'],
    ja: ['マクロを全部消して', 'マクロを全部削除して'],
    ko: ['매크로 전부 지워줘', '매크로 다 삭제해줘'],
    zh: ['删除所有宏', '清空所有宏']
  },
  'skip song': {
    fr: ['chanson suivante', 'musique suivante', 'passe la chanson', 'change de chanson', 'piste suivante', 'suivant'],
    de: ['nächstes lied', 'nächster song', 'überspringe das lied', 'lied überspringen', 'nächster titel'],
    it: ['prossima canzone', 'canzone successiva', 'salta la canzone', 'cambia canzone', 'passa alla prossima'],
    pt: ['proxima musica', 'pula a musica', 'pule a musica', 'muda a musica', 'troca a musica'],
    ru: ['следующая песня', 'следующий трек', 'пропусти песню', 'пропусти трек', 'переключи песню'],
    ja: ['次の曲', '次の曲にして', '曲をスキップして', '曲を飛ばして'],
    ko: ['다음 곡', '다음 곡 틀어줘', '다음 노래', '노래 넘겨줘', '다음 곡으로'],
    zh: ['下一首', '切歌', '跳过这首歌', '换一首']
  },
  'previous track': {
    fr: ['chanson précédente', 'musique précédente', 'piste précédente', 'reviens à la chanson précédente'],
    de: ['vorheriges lied', 'voriges lied', 'vorheriger song', 'vorheriger titel'],
    it: ['canzone precedente', 'torna alla canzone precedente', 'traccia precedente'],
    pt: ['musica anterior', 'volta a musica', 'volta para a musica anterior', 'faixa anterior'],
    ru: ['предыдущая песня', 'предыдущий трек', 'верни прошлую песню'],
    ja: ['前の曲', '前の曲にして', '前の曲に戻して'],
    ko: ['이전 곡', '이전 노래', '이전 곡 틀어줘', '전 곡으로'],
    zh: ['上一首', '上一首歌', '播放上一首']
  },
  'pause the music': {
    fr: ['mets la musique en pause', 'pause la musique', 'arrête la musique', 'mets en pause'],
    de: ['pausiere die musik', 'musik pausieren', 'stopp die musik', 'stoppe die musik', 'mach die musik aus'],
    it: ['metti in pausa la musica', 'ferma la musica', 'pausa la musica', 'metti in pausa'],
    pt: ['pausa a musica', 'pause a musica', 'para a musica', 'pare a musica'],
    ru: ['поставь музыку на паузу', 'поставь на паузу', 'останови музыку', 'выключи музыку', 'пауза'],
    ja: ['音楽を止めて', '音楽を一時停止して', '一時停止して', '曲を止めて'],
    ko: ['음악 멈춰줘', '음악 일시정지', '일시정지 해줘', '노래 꺼줘', '노래 멈춰줘'],
    zh: ['暂停音乐', '暂停', '停止音乐', '把音乐停了']
  },
  'resume the music': {
    fr: ['reprends la musique', 'remets la musique', 'relance la musique'],
    de: ['musik fortsetzen', 'setze die musik fort', 'spiel die musik weiter', 'musik weiter'],
    it: ['riprendi la musica', 'fai ripartire la musica', 'rimetti la musica'],
    pt: ['continua a musica', 'continue a musica', 'volta a tocar', 'retoma a musica'],
    ru: ['продолжи музыку', 'включи музыку снова', 'возобнови музыку'],
    ja: ['音楽を再開して', '再開して', '曲を再開して'],
    ko: ['음악 다시 틀어줘', '다시 재생해줘', '음악 재개해줘'],
    zh: ['继续播放', '继续播放音乐', '恢复音乐', '接着放']
  },
  'sit on tabs': {
    fr: ['assieds toi sur les onglets', 'assieds toi sur la fenêtre', 'assois toi sur les onglets'],
    de: ['setz dich auf die tabs', 'setz dich auf das fenster'],
    it: ['siediti sulle schede', 'siediti sulla finestra'],
    pt: ['senta nas abas', 'sente nas abas', 'senta na janela', 'sente na janela'],
    ru: ['сядь на вкладки', 'сядь на окно', 'присядь на вкладки'],
    ja: ['タブに座って', 'ウィンドウに座って'],
    ko: ['탭에 앉아줘', '탭 위에 앉아', '창에 앉아줘'],
    zh: ['坐到标签页上', '坐在标签页上', '坐到窗口上']
  },
  'open scanner': {
    fr: ['ouvre le scanner', 'active le scanner', 'mode scanner'],
    de: ['öffne den scanner', 'scanner öffnen', 'aktiviere den scanner', 'scanner an'],
    it: ['apri lo scanner', 'attiva lo scanner', 'modalità scanner'],
    pt: ['abre o scanner', 'abra o scanner', 'ativa o scanner', 'ative o scanner', 'modo scanner'],
    ru: ['открой сканер', 'включи сканер', 'сканер', 'режим сканера'],
    ja: ['スキャナーを開いて', 'スキャナーを起動して', 'スキャナーをつけて', 'スキャナー'],
    ko: ['스캐너 열어줘', '스캐너 켜줘', '스캐너'],
    zh: ['打开扫描仪', '开启扫描仪', '启动扫描仪', '扫描仪']
  },
  'close scanner': {
    fr: ['ferme le scanner', 'désactive le scanner', 'éteins le scanner'],
    de: ['schließe den scanner', 'scanner schließen', 'scanner aus', 'deaktiviere den scanner'],
    it: ['chiudi lo scanner', 'disattiva lo scanner', 'spegni lo scanner'],
    pt: ['fecha o scanner', 'feche o scanner', 'desativa o scanner', 'desative o scanner'],
    ru: ['закрой сканер', 'выключи сканер'],
    ja: ['スキャナーを閉じて', 'スキャナーを止めて', 'スキャナーを消して'],
    ko: ['스캐너 닫아줘', '스캐너 꺼줘'],
    zh: ['关闭扫描仪', '关掉扫描仪']
  },
  scan: {
    fr: ['scanne', 'scanne ça', 'scanne l écran', 'analyse ça', 'analyse l écran'],
    de: ['scanne', 'scanne das', 'scanne den bildschirm', 'analysiere das', 'analysiere den bildschirm'],
    it: ['scansiona', 'scansiona questo', 'scansiona lo schermo', 'analizza questo', 'analizza lo schermo'],
    pt: ['escaneia', 'escaneia isso', 'escaneie isso', 'escaneia a tela', 'analisa isso', 'analise isso', 'analisa a tela'],
    ru: ['сканируй', 'просканируй', 'просканируй это', 'просканируй экран', 'проанализируй это', 'проанализируй экран'],
    ja: ['スキャンして', 'これをスキャンして', '画面をスキャンして', 'これを分析して', '画面を分析して'],
    ko: ['스캔해줘', '이거 스캔해줘', '화면 스캔해줘', '이거 분석해줘', '화면 분석해줘'],
    zh: ['扫描', '扫描一下', '扫描这个', '扫描屏幕', '分析这个', '分析屏幕']
  },
  'turn on gaming mode': {
    fr: ['active le mode gaming', 'active le mode jeu', 'mode gaming', 'mode jeu', 'passe en mode jeu'],
    de: ['aktiviere den spielmodus', 'spielmodus an', 'gaming modus an', 'spielmodus', 'gaming modus'],
    it: ['attiva la modalità gioco', 'modalità gioco', 'modalità gaming', 'attiva la modalità gaming'],
    pt: ['ativa o modo jogo', 'ative o modo jogo', 'modo jogo', 'modo gamer', 'ativa o modo gaming'],
    ru: ['включи игровой режим', 'игровой режим'],
    ja: ['ゲームモードにして', 'ゲームモードをオンにして', 'ゲームモード'],
    ko: ['게임 모드 켜줘', '게임 모드'],
    zh: ['打开游戏模式', '开启游戏模式', '游戏模式']
  },
  'turn off gaming mode': {
    fr: ['désactive le mode gaming', 'désactive le mode jeu', 'quitte le mode jeu'],
    de: ['deaktiviere den spielmodus', 'spielmodus aus', 'gaming modus aus', 'beende den spielmodus'],
    it: ['disattiva la modalità gioco', 'esci dalla modalità gioco', 'disattiva la modalità gaming'],
    pt: ['desativa o modo jogo', 'desative o modo jogo', 'sai do modo jogo', 'desativa o modo gaming'],
    ru: ['выключи игровой режим', 'выйди из игрового режима'],
    ja: ['ゲームモードをオフにして', 'ゲームモードを終了して'],
    ko: ['게임 모드 꺼줘', '게임 모드 해제해줘'],
    zh: ['关闭游戏模式', '退出游戏模式']
  },
  'game commentary off': {
    fr: ['coupe les commentaires de jeu', 'désactive les commentaires de jeu'],
    de: ['spielkommentare aus', 'deaktiviere die spielkommentare'],
    it: ['disattiva i commenti di gioco', 'silenzia i commenti di gioco'],
    pt: ['desativa os comentarios de jogo', 'silencia os comentarios de jogo'],
    ru: ['выключи игровые комментарии', 'отключи комментарии к игре'],
    ja: ['ゲーム実況をオフにして', 'ゲームのコメントをオフにして'],
    ko: ['게임 해설 꺼줘', '게임 코멘트 꺼줘'],
    zh: ['关闭游戏解说', '关闭游戏评论']
  },
  'game commentary on': {
    fr: ['active les commentaires de jeu', 'remets les commentaires de jeu'],
    de: ['spielkommentare an', 'aktiviere die spielkommentare'],
    it: ['attiva i commenti di gioco', 'riattiva i commenti di gioco'],
    pt: ['ativa os comentarios de jogo', 'reativa os comentarios de jogo'],
    ru: ['включи игровые комментарии', 'включи комментарии к игре'],
    ja: ['ゲーム実況をオンにして', 'ゲームのコメントをオンにして'],
    ko: ['게임 해설 켜줘', '게임 코멘트 켜줘'],
    zh: ['开启游戏解说', '打开游戏解说', '开启游戏评论']
  },
  'turn on auto accept': {
    fr: ['active l acceptation automatique', 'active l auto accept'],
    de: ['aktiviere auto accept', 'automatisch annehmen an', 'aktiviere automatisches annehmen'],
    it: ['attiva l accettazione automatica', 'attiva auto accept'],
    pt: ['ativa o aceitar automatico', 'ative o aceitar automatico', 'ativa o auto aceitar', 'ative o auto aceitar'],
    ru: ['включи автопринятие', 'включи авто принятие'],
    ja: ['自動承諾をオンにして', 'オートアクセプトをオンにして'],
    ko: ['자동 수락 켜줘'],
    zh: ['开启自动接受', '打开自动接受']
  },
  'turn off auto accept': {
    fr: ['désactive l acceptation automatique', 'désactive l auto accept'],
    de: ['deaktiviere auto accept', 'automatisch annehmen aus', 'deaktiviere automatisches annehmen'],
    it: ['disattiva l accettazione automatica', 'disattiva auto accept'],
    pt: ['desativa o aceitar automatico', 'desative o aceitar automatico', 'desativa o auto aceitar', 'desative o auto aceitar'],
    ru: ['выключи автопринятие', 'выключи авто принятие'],
    ja: ['自動承諾をオフにして', 'オートアクセプトをオフにして'],
    ko: ['자동 수락 꺼줘'],
    zh: ['关闭自动接受']
  },
  'find a match': {
    fr: ['cherche une partie', 'lance une partie', 'trouve une partie'],
    de: ['suche ein spiel', 'such ein match', 'finde ein spiel', 'starte die suche'],
    it: ['cerca una partita', 'trova una partita', 'avvia una partita'],
    pt: ['procura uma partida', 'procure uma partida', 'busca uma partida', 'busque uma partida'],
    ru: ['найди игру', 'найди матч', 'начни поиск игры'],
    ja: ['マッチを探して', '試合を探して', 'キューに入って'],
    ko: ['매치 찾아줘', '게임 찾아줘', '큐 돌려줘'],
    zh: ['找一局', '开始匹配', '寻找对局', '匹配一局']
  },
  'accept the match': {
    fr: ['accepte la partie', 'accepte le match'],
    de: ['nimm das spiel an', 'match annehmen', 'akzeptiere das spiel'],
    it: ['accetta la partita'],
    pt: ['aceita a partida', 'aceite a partida'],
    ru: ['прими игру', 'прими матч'],
    ja: ['マッチを承諾して', '試合を受けて'],
    ko: ['매치 수락해줘', '게임 수락해줘'],
    zh: ['接受对局', '接受比赛']
  },
  'cancel the queue': {
    fr: ['annule la file', 'annule la file d attente', 'annule la recherche'],
    de: ['warteschlange abbrechen', 'brich die warteschlange ab', 'suche abbrechen'],
    it: ['annulla la coda', 'annulla la ricerca'],
    pt: ['cancela a fila', 'cancele a fila', 'cancela a busca'],
    ru: ['отмени очередь', 'отмени поиск'],
    ja: ['キューをキャンセルして', 'マッチングをキャンセルして'],
    ko: ['큐 취소해줘', '매칭 취소해줘'],
    zh: ['取消排队', '取消匹配']
  },
  'shut down': {
    fr: ['éteins toi', 'ferme toi'],
    de: ['schalte dich aus', 'fahr herunter', 'beende dich'],
    it: ['spegniti', 'chiuditi'],
    pt: ['desliga', 'se desliga', 'desligue se', 'fecha o programa'],
    ru: ['выключись', 'отключись', 'закройся'],
    ja: ['シャットダウンして', '電源を切って', '終了して'],
    ko: ['꺼져줘', '종료해줘', '전원 꺼줘'],
    zh: ['关机', '退出吧', '关闭你自己']
  },
  'what do you remember about me': {
    fr: ['qu est ce que tu sais de moi', 'que sais tu de moi', 'de quoi tu te souviens sur moi', 'tu te souviens de quoi sur moi', 'qu est ce que tu te rappelles de moi'],
    de: ['was weißt du uber mich', 'was weisst du uber mich', 'woran erinnerst du dich bei mir', 'was hast du dir uber mich gemerkt'],
    it: ['cosa ricordi di me', 'che cosa ricordi di me', 'cosa sai di me', 'cosa ti ricordi di me'],
    pt: ['o que voce lembra de mim', 'o que voce sabe sobre mim', 'do que voce lembra sobre mim', 'o que voce lembra sobre mim'],
    ru: ['что ты помнишь обо мне', 'что ты знаешь обо мне', 'что ты обо мне помнишь'],
    ja: ['私について何を覚えてる', '私のこと何を覚えてる', '私のこと何覚えてる', '私について何を知ってる'],
    ko: ['나에 대해 뭘 기억해', '나에 대해 뭐 기억해', '나에 대해 뭐 알아', '나에 대해 기억하는 거 있어'],
    zh: ['你记得我什么', '关于我你记得什么', '你记得关于我的什么', '你对我了解多少']
  },
  'forget everything': {
    fr: ['oublie tout', 'oublie tout sur moi', 'oublie tout ce que tu sais'],
    de: ['vergiss alles', 'vergiss alles uber mich'],
    it: ['dimentica tutto', 'dimenticati tutto', 'dimentica tutto di me'],
    pt: ['esquece tudo', 'esqueca tudo', 'esquece tudo sobre mim'],
    ru: ['забудь всё', 'забудь все', 'забудь всё обо мне', 'забудь все обо мне'],
    ja: ['全部忘れて', 'すべて忘れて', '私のこと全部忘れて'],
    ko: ['다 잊어줘', '전부 잊어줘', '나에 대해 다 잊어줘'],
    zh: ['全部忘掉', '忘掉一切', '忘记所有', '把我的事都忘了']
  }
}

/** Sentences with a free part, tried in this order */
export const TEMPLATE_COMMANDS: { en: string; forms: Forms }[] = [
  {
    en: 'play {x} on spotify',
    forms: {
      fr: ['joue {x} sur spotify', 'mets {x} sur spotify', 'lance {x} sur spotify'],
      de: ['spiele {x} auf spotify', 'spiel {x} auf spotify', 'spiele {x} bei spotify'],
      it: ['metti {x} su spotify', 'riproduci {x} su spotify'],
      pt: ['toca {x} no spotify', 'coloca {x} no spotify', 'toque {x} no spotify', 'coloque {x} no spotify'],
      ru: ['включи {x} на spotify', 'включи {x} в spotify', 'поставь {x} на spotify'],
      ja: ['spotifyで{x}を再生して', 'spotifyで{x}をかけて', 'スポティファイで{x}を再生して'],
      ko: ['스포티파이에서 {x} 틀어줘', 'spotify에서 {x} 틀어줘', '스포티파이에서 {x} 재생해줘', 'spotify에서 {x} 재생해줘'],
      zh: ['在spotify上播放{x}', '在spotify播放{x}', '用spotify播放{x}']
    }
  },
  {
    en: 'play {x} on youtube',
    forms: {
      fr: ['joue {x} sur youtube', 'mets {x} sur youtube', 'lance {x} sur youtube'],
      de: ['spiele {x} auf youtube', 'spiel {x} auf youtube'],
      it: ['metti {x} su youtube', 'riproduci {x} su youtube'],
      pt: ['toca {x} no youtube', 'coloca {x} no youtube', 'toque {x} no youtube', 'coloque {x} no youtube'],
      ru: ['включи {x} на youtube', 'включи {x} на ютубе', 'поставь {x} на youtube'],
      ja: ['youtubeで{x}を再生して', 'youtubeで{x}をかけて', 'ユーチューブで{x}を再生して'],
      ko: ['유튜브에서 {x} 틀어줘', 'youtube에서 {x} 틀어줘', '유튜브에서 {x} 재생해줘'],
      zh: ['在youtube上播放{x}', '在youtube播放{x}', '用youtube播放{x}']
    }
  },
  {
    en: 'play {x} on spotify',
    forms: {
      fr: ['joue {x}', 'joue moi {x}'],
      de: ['spiele {x}', 'spiel {x}'],
      it: ['riproduci {x}', 'fammi sentire {x}'],
      pt: ['toque {x}', 'reproduz {x}', 'reproduza {x}'],
      ru: ['поставь {x}', 'сыграй {x}'],
      ja: ['{x}を再生して', '{x}をかけて', '{x}を流して'],
      ko: ['{x} 틀어줘', '{x} 재생해줘'],
      zh: ['播放{x}', '放一首{x}']
    }
  },
  {
    en: 'search the web for {x}',
    forms: {
      fr: ['cherche {x} sur internet', 'cherche sur internet {x}', 'cherche sur le web {x}', 'cherche {x} sur le web', 'recherche {x} sur internet'],
      de: ['suche im internet nach {x}', 'such im internet nach {x}', 'suche online nach {x}', 'google nach {x}'],
      it: ['cerca su internet {x}', 'cerca {x} su internet', 'cerca sul web {x}', 'cerca {x} sul web'],
      pt: ['pesquisa na internet {x}', 'pesquise na internet {x}', 'pesquisa {x} na internet', 'pesquise {x} na internet', 'procura na internet {x}', 'procure {x} na internet'],
      ru: ['найди в интернете {x}', 'поищи в интернете {x}', 'загугли {x}', 'погугли {x}'],
      ja: ['{x}をネットで検索して', 'ネットで{x}を検索して', '{x}を検索して', '{x}をググって'],
      ko: ['인터넷에서 {x} 검색해줘', '{x} 검색해줘'],
      zh: ['在网上搜索{x}', '上网搜索{x}', '搜索一下{x}', '搜索{x}', '百度一下{x}']
    }
  },
  {
    en: 'delete the macro {x}',
    forms: {
      fr: ['supprime la macro {x}', 'efface la macro {x}'],
      de: ['lösche das makro {x}', 'lösche makro {x}'],
      it: ['cancella la macro {x}', 'elimina la macro {x}'],
      pt: ['apaga a macro {x}', 'apague a macro {x}', 'exclui a macro {x}'],
      ru: ['удали макрос {x}'],
      ja: ['マクロ{x}を消して', 'マクロ{x}を削除して', '{x}のマクロを消して', '{x}のマクロを削除して'],
      ko: ['{x} 매크로 지워줘', '{x} 매크로 삭제해줘', '매크로 {x} 삭제해줘'],
      zh: ['删除宏{x}', '删掉宏{x}', '删除{x}这个宏']
    }
  },
  {
    en: 'ban {w}',
    forms: {
      fr: ['bannis {w}'],
      de: ['banne {w}', 'bann {w}'],
      it: ['banna {w}'],
      pt: ['bane {w}', 'bana {w}'],
      ru: ['забань {w}', 'забани {w}'],
      ja: ['{w}をバンして'],
      ko: ['{w} 밴해줘', '{w} 밴'],
      zh: ['ban掉{w}', '禁掉{w}', '禁用{w}']
    }
  },
  {
    en: 'lock {w} in valorant',
    forms: {
      fr: ['lock {w} dans valorant', 'choisis {w} dans valorant', 'prends {w} dans valorant', 'verrouille {w} dans valorant'],
      de: ['wähle {w} in valorant', 'nimm {w} in valorant'],
      it: ['scegli {w} in valorant', 'prendi {w} in valorant', 'blocca {w} in valorant'],
      pt: ['lock {w} no valorant', 'escolhe {w} no valorant', 'escolha {w} no valorant', 'pega {w} no valorant', 'trava {w} no valorant'],
      ru: ['залочь {w} в валоранте', 'выбери {w} в валоранте', 'залочь {w} в valorant', 'выбери {w} в valorant'],
      ja: ['ヴァロで{w}をロックして', 'valorantで{w}をロックして', 'ヴァロラントで{w}を選んで', 'valorantで{w}を選んで'],
      ko: ['발로란트에서 {w} 락해줘', '발로에서 {w} 픽해줘', '발로란트에서 {w} 골라줘', 'valorant에서 {w} 픽해줘'],
      zh: ['在瓦罗兰特里选{w}', '瓦罗兰特锁{w}', '无畏契约选{w}', '在valorant里选{w}', 'valorant锁定{w}']
    }
  },
  {
    en: 'pick {w}',
    forms: {
      fr: ['choisis {w}'],
      de: ['wähle {w}'],
      it: ['scegli {w}', 'pickka {w}'],
      pt: ['escolhe {w}', 'escolha {w}'],
      ru: ['выбери {w}', 'пикни {w}'],
      ja: ['{w}をピックして', '{w}を選んで'],
      ko: ['{w} 픽해줘', '{w} 골라줘'],
      zh: ['选择{w}', '选{w}吧', 'pick{w}']
    }
  },
  {
    en: 'draw {x}',
    forms: {
      fr: ['dessine {x}', 'dessine moi {x}'],
      de: ['zeichne {x}', 'zeichne mir {x}', 'mal {x}', 'male {x}'],
      it: ['disegna {x}', 'disegnami {x}'],
      pt: ['desenha {x}', 'desenhe {x}'],
      ru: ['нарисуй {x}', 'нарисуй мне {x}'],
      ja: ['{x}を描いて', '{x}の絵を描いて'],
      ko: ['{x} 그려줘'],
      zh: ['画一个{x}', '画个{x}', '帮我画{x}']
    }
  },
  {
    // What to remember stays in the user's words: memory-commands.ts takes it from the original
    en: 'remember that {x}',
    forms: {
      fr: ['souviens toi que {x}', 'rappelle toi que {x}', 'n oublie pas que {x}', 'retiens que {x}', 'souviens toi de {x}', 'note que {x}'],
      de: ['merk dir dass {x}', 'vergiss nicht dass {x}', 'denk dran dass {x}', 'denk daran dass {x}', 'merk dir {x}'],
      it: ['ricorda che {x}', 'ricordati che {x}', 'non dimenticare che {x}', 'tieni a mente che {x}', 'ricordati di {x}'],
      pt: ['lembra que {x}', 'lembre que {x}', 'lembre se que {x}', 'nao esquece que {x}', 'nao esqueca que {x}', 'grava que {x}', 'lembra de {x}'],
      ru: ['запомни что {x}', 'не забудь что {x}', 'помни что {x}', 'запомни {x}'],
      ja: ['{x}って覚えておいて', '{x}と覚えておいて', '{x}を覚えておいて', '{x}を忘れないで', '{x}って覚えて', '{x}を覚えて'],
      ko: ['{x}라는 거 기억해줘', '{x} 기억해줘', '{x} 잊지 마', '{x} 기억해'],
      zh: ['请记住{x}', '记住{x}', '别忘了{x}', '记得{x}', '記住{x}']
    }
  },
  {
    en: 'forget that {x}',
    forms: {
      fr: ['oublie que {x}', 'oublie {x}'],
      de: ['vergiss dass {x}', 'vergiss {x}'],
      it: ['dimentica che {x}', 'dimenticati che {x}', 'dimenticati di {x}', 'dimentica {x}'],
      pt: ['esquece que {x}', 'esqueca que {x}', 'esquece {x}', 'esqueca {x}'],
      ru: ['забудь что {x}', 'забудь про {x}', 'забудь о {x}', 'забудь {x}'],
      ja: ['{x}のことは忘れて', '{x}は忘れて', '{x}を忘れて'],
      ko: ['{x}는 잊어줘', '{x} 잊어줘', '{x} 잊어버려'],
      zh: ['忘掉{x}', '忘记{x}', '忘了{x}']
    }
  }
]

/** "Parle en espagnol": the language's name changes with who's asking */
const LANGUAGE_NAMES: Record<string, Record<CommandLang, string>> = {
  spanish: { fr: 'espagnol', de: 'spanisch', it: 'spagnolo', pt: 'espanhol', ru: 'испански', ja: 'スペイン語', ko: '스페인어', zh: '西班牙语' },
  english: { fr: 'anglais', de: 'englisch', it: 'inglese', pt: 'ingles', ru: 'английски', ja: '英語', ko: '영어', zh: '英语' },
  portuguese: { fr: 'portugais', de: 'portugiesisch', it: 'portoghese', pt: 'portugues', ru: 'португальски', ja: 'ポルトガル語', ko: '포르투갈어', zh: '葡萄牙语' },
  french: { fr: 'français', de: 'französisch', it: 'francese', pt: 'frances', ru: 'французски', ja: 'フランス語', ko: '프랑스어', zh: '法语' },
  german: { fr: 'allemand', de: 'deutsch', it: 'tedesco', pt: 'alemao', ru: 'немецки', ja: 'ドイツ語', ko: '독일어', zh: '德语' },
  italian: { fr: 'italien', de: 'italienisch', it: 'italiano', pt: 'italiano', ru: 'итальянски', ja: 'イタリア語', ko: '이탈리아어', zh: '意大利语' },
  russian: { fr: 'russe', de: 'russisch', it: 'russo', pt: 'russo', ru: 'русски', ja: 'ロシア語', ko: '러시아어', zh: '俄语' },
  japanese: { fr: 'japonais', de: 'japanisch', it: 'giapponese', pt: 'japones', ru: 'японски', ja: '日本語', ko: '일본어', zh: '日语' },
  korean: { fr: 'coréen', de: 'koreanisch', it: 'coreano', pt: 'coreano', ru: 'корейски', ja: '韓国語', ko: '한국어', zh: '韩语' },
  chinese: { fr: 'chinois', de: 'chinesisch', it: 'cinese', pt: 'chines', ru: 'китайски', ja: '中国語', ko: '중국어', zh: '中文' }
}
const LANGUAGE_FORMS: Record<CommandLang, string[]> = {
  fr: ['parle en {l}', 'parle moi en {l}', 'réponds en {l}'],
  de: ['sprich {l}', 'sprich auf {l}', 'antworte auf {l}'],
  it: ['parla in {l}', 'parlami in {l}', 'rispondi in {l}'],
  pt: ['fala em {l}', 'fale em {l}', 'responde em {l}', 'responda em {l}'],
  ru: ['говори по {l}', 'отвечай по {l}'],
  ja: ['{l}で話して', '{l}で答えて'],
  ko: ['{l}로 말해줘', '{l}로 대답해줘'],
  zh: ['说{l}', '用{l}说话', '用{l}回答']
}

function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/([a-z])[̀-ͯ]+/gi, '$1') // only Latin accents: the й in Russian is a letter of its own
    .replace(/ß/g, 'ss')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[?!.,;:¡¿。！？、，「」"'’…«»-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const POLITE = /^(?:hey |hola |ok |okay |dis |bitte |ei |ehi |oi |эй )?(?:capri |kapri |カプリ |카프리 )?(?:s il te plait |s il te plaît |stp |bitte |per favore |por favor |пожалуйста |请你|请|請)?/
const POLITE_END = /(?: s il te plait| stp| bitte| per favore| por favor| capri| пожалуйста|ください|してください|주세요)$/

function key(text: string): string {
  return plain(text).replace(POLITE, '').replace(POLITE_END, '').trim()
}

/** A phrase as a pattern: spaces are optional where the language doesn't use them */
function compile(phrase: string): RegExp {
  const clean = plain(phrase).replace(/[.*+?^$()|[\]\\]/g, '\\$&')
  const body = clean
    .replace(/ /g, /[぀-ヿ가-힯一-鿿]/.test(clean) ? '\\s*' : '\\s+')
    .replace('{x}', '(.+?)')
    .replace('{w}', '(\\S+)')
  return new RegExp(`^${body}$`, 'u')
}

interface Compiled {
  lang: CommandLang
  pattern: RegExp
  en: string
}

const COMPILED: Compiled[] = (() => {
  const all: Compiled[] = []
  for (const [en, forms] of Object.entries(FIXED_COMMANDS)) {
    for (const lang of COMMAND_LANGS) for (const phrase of forms[lang]) all.push({ lang, pattern: compile(phrase), en })
  }
  for (const lang of COMMAND_LANGS) {
    for (const form of LANGUAGE_FORMS[lang]) {
      for (const [english, names] of Object.entries(LANGUAGE_NAMES)) {
        all.push({ lang, pattern: compile(form.replace('{l}', names[lang])), en: `talk in ${english}` })
      }
    }
  }
  for (const { en, forms } of TEMPLATE_COMMANDS) {
    for (const lang of COMMAND_LANGS) {
      for (const phrase of [...forms[lang]].sort((a, b) => b.length - a.length)) all.push({ lang, pattern: compile(phrase), en })
    }
  }
  return all
})()

/** The English command for a sentence and the language it was in, or null if it isn't a fixed command */
export function commandInEnglish(text: string): { text: string; lang: CommandLang } | null {
  const said = key(text)
  if (!said || said.length > 200) return null
  for (const { lang, pattern, en } of COMPILED) {
    const m = said.match(pattern)
    if (!m) continue
    // Her champion names are in Latin letters: "아리" has to go through the translator to become "Ahri"
    if (en.includes('{w}') && /[^\x00-\x7f]/.test(m[1])) return null
    return { text: en.replace(/\{[xw]\}/, () => (m[1] || '').trim()), lang }
  }
  return null
}

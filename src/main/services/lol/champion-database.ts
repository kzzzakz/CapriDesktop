export interface ChampionEntry {
  id: number
  name: string
  key: string
  aliases: string[]
}

export const KNOWN_CHAMPIONS: ChampionEntry[] = [
  { id: 266, name: 'Aatrox', key: 'aatrox', aliases: ['atrox'] },
  { id: 103, name: 'Ahri', key: 'ahri', aliases: ['ari'] },
  { id: 84, name: 'Akali', key: 'akali', aliases: [] },
  { id: 166, name: 'Akshan', key: 'akshan', aliases: ['axan'] },
  { id: 12, name: 'Alistar', key: 'alistar', aliases: ['ali', 'vaca', 'toro'] },
  { id: 799, name: 'Ambessa', key: 'ambessa', aliases: ['ambesa'] },
  { id: 32, name: 'Amumu', key: 'amumu', aliases: ['momia'] },
  { id: 34, name: 'Anivia', key: 'anivia', aliases: ['pajaro', 'pollo'] },
  { id: 1, name: 'Annie', key: 'annie', aliases: ['tibbers'] },
  { id: 523, name: 'Aphelios', key: 'aphelios', aliases: ['phel', 'afelios'] },
  { id: 22, name: 'Ashe', key: 'ashe', aliases: ['ash'] },
  { id: 136, name: 'Aurelion Sol', key: 'aurelionsol', aliases: ['asol', 'dragon', 'aurelion'] },
  { id: 893, name: 'Aurora', key: 'aurora', aliases: [] },
  { id: 268, name: 'Azir', key: 'azir', aliases: ['palomo', 'pollo'] },
  { id: 432, name: 'Bard', key: 'bard', aliases: ['bardo'] },
  { id: 200, name: 'Bel\'Veth', key: 'belveth', aliases: ['belveth', 'manta'] },
  { id: 53, name: 'Blitzcrank', key: 'blitzcrank', aliases: ['blitz', 'robot', 'gancho'] },
  { id: 63, name: 'Brand', key: 'brand', aliases: ['fuego'] },
  { id: 201, name: 'Braum', key: 'braum', aliases: ['escudo'] },
  { id: 233, name: 'Briar', key: 'briar', aliases: [] },
  { id: 51, name: 'Caitlyn', key: 'caitlyn', aliases: ['cait', 'caitlin'] },
  { id: 164, name: 'Camille', key: 'camille', aliases: ['camil', 'tijeras'] },
  { id: 69, name: 'Cassiopeia', key: 'cassiopeia', aliases: ['casio', 'serpiente', 'casi'] },
  { id: 31, name: 'Cho\'Gath', key: 'chogath', aliases: ['chogath', 'cho'] },
  { id: 42, name: 'Corki', key: 'corki', aliases: [] },
  { id: 122, name: 'Darius', key: 'darius', aliases: ['dario'] },
  { id: 131, name: 'Diana', key: 'diana', aliases: [] },
  { id: 119, name: 'Draven', key: 'draven', aliases: [] },
  { id: 36, name: 'Dr. Mundo', key: 'drmundo', aliases: ['mundo', 'dr mundo'] },
  { id: 245, name: 'Ekko', key: 'ekko', aliases: ['eko'] },
  { id: 60, name: 'Elise', key: 'elise', aliases: ['araña'] },
  { id: 28, name: 'Evelynn', key: 'evelynn', aliases: ['eve', 'evelyn'] },
  { id: 81, name: 'Ezreal', key: 'ezreal', aliases: ['ez'] },
  { id: 9, name: 'Fiddlesticks', key: 'fiddlesticks', aliases: ['fiddle', 'espantapajaros'] },
  { id: 114, name: 'Fiora', key: 'fiora', aliases: [] },
  { id: 105, name: 'Fizz', key: 'fizz', aliases: ['pescado', 'pez'] },
  { id: 3, name: 'Galio', key: 'galio', aliases: [] },
  { id: 41, name: 'Gangplank', key: 'gangplank', aliases: ['gp', 'pirata'] },
  { id: 86, name: 'Garen', key: 'garen', aliases: ['trompo'] },
  { id: 150, name: 'Gnar', key: 'gnar', aliases: [] },
  { id: 79, name: 'Gragas', key: 'gragas', aliases: ['gordo', 'barril'] },
  { id: 104, name: 'Graves', key: 'graves', aliases: ['escopeta'] },
  { id: 887, name: 'Gwen', key: 'gwen', aliases: [] },
  { id: 120, name: 'Hecarim', key: 'hecarim', aliases: ['heca', 'caballo'] },
  { id: 74, name: 'Heimerdinger', key: 'heimerdinger', aliases: ['heimer', 'torretas'] },
  { id: 910, name: 'Hwei', key: 'hwei', aliases: ['wei', 'pintor'] },
  { id: 420, name: 'Illaoi', key: 'illaoi', aliases: ['pulpo', 'tentaculos'] },
  { id: 39, name: 'Irelia', key: 'irelia', aliases: [] },
  { id: 427, name: 'Ivern', key: 'ivern', aliases: ['arbol'] },
  { id: 40, name: 'Janna', key: 'janna', aliases: [] },
  { id: 59, name: 'Jarvan IV', key: 'jarvaniv', aliases: ['j4', 'jarvan'] },
  { id: 24, name: 'Jax', key: 'jax', aliases: ['farol'] },
  { id: 126, name: 'Jayce', key: 'jayce', aliases: [] },
  { id: 202, name: 'Jhin', key: 'jhin', aliases: ['cuatro', '4'] },
  { id: 222, name: 'Jinx', key: 'jinx', aliases: ['jin'] },
  { id: 145, name: 'Kai\'Sa', key: 'kaisa', aliases: ['kaisa'] },
  { id: 429, name: 'Kalista', key: 'kalista', aliases: [] },
  { id: 43, name: 'Karma', key: 'karma', aliases: [] },
  { id: 30, name: 'Karthus', key: 'karthus', aliases: [] },
  { id: 38, name: 'Kassadin', key: 'kassadin', aliases: ['kassa'] },
  { id: 55, name: 'Katarina', key: 'katarina', aliases: ['kata'] },
  { id: 10, name: 'Kayle', key: 'kayle', aliases: ['keil'] },
  { id: 141, name: 'Kayn', key: 'kayn', aliases: ['rhaast', 'kain'] },
  { id: 85, name: 'Kennen', key: 'kennen', aliases: [] },
  { id: 121, name: 'Kha\'Zix', key: 'khazix', aliases: ['khazix', 'kha', 'cucaracha'] },
  { id: 203, name: 'Kindred', key: 'kindred', aliases: ['cordero', 'lobo'] },
  { id: 240, name: 'Kled', key: 'kled', aliases: ['skaarl'] },
  { id: 96, name: 'Kog\'Maw', key: 'kogmaw', aliases: ['kogmaw', 'kog'] },
  { id: 897, name: 'K\'Sante', key: 'ksante', aliases: ['ksante', 'sante'] },
  { id: 7, name: 'LeBlanc', key: 'leblanc', aliases: ['lb', 'leblank'] },
  { id: 64, name: 'Lee Sin', key: 'leesin', aliases: ['lee', 'ciego', 'li sin'] },
  { id: 89, name: 'Leona', key: 'leona', aliases: ['sol'] },
  { id: 876, name: 'Lillia', key: 'lillia', aliases: ['bambi', 'cierva'] },
  { id: 127, name: 'Lissandra', key: 'lissandra', aliases: ['lisan'] },
  { id: 236, name: 'Lucian', key: 'lucian', aliases: [] },
  { id: 117, name: 'Lulu', key: 'lulu', aliases: [] },
  { id: 99, name: 'Lux', key: 'lux', aliases: ['rayito'] },
  { id: 54, name: 'Malphite', key: 'malphite', aliases: ['malfite', 'roca', 'piedra'] },
  { id: 90, name: 'Malzahar', key: 'malzahar', aliases: ['malza'] },
  { id: 57, name: 'Maokai', key: 'maokai', aliases: ['arbol'] },
  { id: 11, name: 'Master Yi', key: 'masteryi', aliases: ['yi', 'maestro yi'] },
  { id: 902, name: 'Milio', key: 'milio', aliases: [] },
  { id: 21, name: 'Miss Fortune', key: 'missfortune', aliases: ['mf', 'fortuna'] },
  { id: 62, name: 'Wukong', key: 'monkeyking', aliases: ['wukong', 'mono', 'kong'] },
  { id: 82, name: 'Mordekaiser', key: 'mordekaiser', aliases: ['morde', 'mordecai'] },
  { id: 25, name: 'Morgana', key: 'morgana', aliases: ['morg'] },
  { id: 950, name: 'Naafiri', key: 'naafiri', aliases: ['perros', 'perro'] },
  { id: 267, name: 'Nami', key: 'nami', aliases: ['pescado', 'sirena'] },
  { id: 75, name: 'Nasus', key: 'nasus', aliases: ['perro', 'dog'] },
  { id: 111, name: 'Nautilus', key: 'nautilus', aliases: ['nauti', 'buzo'] },
  { id: 518, name: 'Neeko', key: 'neeko', aliases: ['niko'] },
  { id: 76, name: 'Nidalee', key: 'nidalee', aliases: ['nida', 'puma'] },
  { id: 895, name: 'Nilah', key: 'nilah', aliases: [] },
  { id: 56, name: 'Nocturne', key: 'nocturne', aliases: ['noc', 'oscuridad'] },
  { id: 20, name: 'Nunu & Willump', key: 'nunu', aliases: ['nunu', 'willump'] },
  { id: 2, name: 'Olaf', key: 'olaf', aliases: ['vikingo'] },
  { id: 61, name: 'Orianna', key: 'orianna', aliases: ['ori', 'bola'] },
  { id: 516, name: 'Ornn', key: 'ornn', aliases: ['orn'] },
  { id: 80, name: 'Pantheon', key: 'pantheon', aliases: ['panth', 'espartano'] },
  { id: 78, name: 'Poppy', key: 'poppy', aliases: ['popi'] },
  { id: 555, name: 'Pyke', key: 'pyke', aliases: ['paik'] },
  { id: 246, name: 'Qiyana', key: 'qiyana', aliases: ['quiyana'] },
  { id: 133, name: 'Quinn', key: 'quinn', aliases: ['pajaro'] },
  { id: 497, name: 'Rakan', key: 'rakan', aliases: [] },
  { id: 33, name: 'Rammus', key: 'rammus', aliases: ['armadillo', 'ok'] },
  { id: 421, name: 'Rek\'Sai', key: 'reksai', aliases: ['reksai', 'tiburon'] },
  { id: 526, name: 'Rell', key: 'rell', aliases: [] },
  { id: 888, name: 'Renata Glasc', key: 'renata', aliases: ['renata'] },
  { id: 58, name: 'Renekton', key: 'renekton', aliases: ['cocodrilo', 'renek'] },
  { id: 107, name: 'Rengar', key: 'rengar', aliases: ['gato'] },
  { id: 92, name: 'Riven', key: 'riven', aliases: [] },
  { id: 68, name: 'Rumble', key: 'rumble', aliases: [] },
  { id: 13, name: 'Ryze', key: 'ryze', aliases: ['pitufo'] },
  { id: 360, name: 'Samira', key: 'samira', aliases: [] },
  { id: 113, name: 'Sejuani', key: 'sejuani', aliases: ['seju', 'cerdo'] },
  { id: 235, name: 'Senna', key: 'senna', aliases: ['sena'] },
  { id: 147, name: 'Seraphine', key: 'seraphine', aliases: ['sera'] },
  { id: 875, name: 'Sett', key: 'sett', aliases: ['set'] },
  { id: 35, name: 'Shaco', key: 'shaco', aliases: ['clown', 'payaso'] },
  { id: 98, name: 'Shen', key: 'shen', aliases: ['ninja'] },
  { id: 102, name: 'Shyvana', key: 'shyvana', aliases: ['dragon'] },
  { id: 27, name: 'Singed', key: 'singed', aliases: ['gas', 'quimico'] },
  { id: 14, name: 'Sion', key: 'sion', aliases: ['tren'] },
  { id: 15, name: 'Sivir', key: 'sivir', aliases: [] },
  { id: 72, name: 'Skarner', key: 'skarner', aliases: ['escorpion'] },
  { id: 901, name: 'Smolder', key: 'smolder', aliases: ['dragoncito'] },
  { id: 37, name: 'Sona', key: 'sona', aliases: [] },
  { id: 16, name: 'Soraka', key: 'soraka', aliases: ['ambulancia', 'banana'] },
  { id: 50, name: 'Swain', key: 'swain', aliases: ['cuervos'] },
  { id: 517, name: 'Sylas', key: 'sylas', aliases: ['cadenas'] },
  { id: 134, name: 'Syndra', key: 'syndra', aliases: [] },
  { id: 223, name: 'Tahm Kench', key: 'tahmkench', aliases: ['tahm', 'sapo', 'kench'] },
  { id: 163, name: 'Taliyah', key: 'taliyah', aliases: ['piedras'] },
  { id: 91, name: 'Talon', key: 'talon', aliases: [] },
  { id: 44, name: 'Taric', key: 'taric', aliases: ['gemas'] },
  { id: 17, name: 'Teemo', key: 'teemo', aliases: ['satan', 'hongo'] },
  { id: 412, name: 'Thresh', key: 'thresh', aliases: ['linterna', 'gancho'] },
  { id: 18, name: 'Tristana', key: 'tristana', aliases: ['trist'] },
  { id: 48, name: 'Trundle', key: 'trundle', aliases: ['troll'] },
  { id: 23, name: 'Tryndamere', key: 'tryndamere', aliases: ['trynda'] },
  { id: 4, name: 'Twisted Fate', key: 'twistedfate', aliases: ['tf', 'cartas'] },
  { id: 29, name: 'Twitch', key: 'twitch', aliases: ['rata'] },
  { id: 77, name: 'Udyr', key: 'udyr', aliases: [] },
  { id: 6, name: 'Urgot', key: 'urgot', aliases: [] },
  { id: 110, name: 'Varus', key: 'varus', aliases: [] },
  { id: 67, name: 'Vayne', key: 'vayne', aliases: ['vein'] },
  { id: 45, name: 'Veigar', key: 'veigar', aliases: ['enano'] },
  { id: 161, name: 'Vel\'Koz', key: 'velkoz', aliases: ['velkoz', 'ojo', 'pulpo'] },
  { id: 711, name: 'Vex', key: 'vex', aliases: ['goth'] },
  { id: 254, name: 'Vi', key: 'vi', aliases: ['guantes'] },
  { id: 234, name: 'Viego', key: 'viego', aliases: ['rey arruinado'] },
  { id: 112, name: 'Viktor', key: 'viktor', aliases: ['laser'] },
  { id: 8, name: 'Vladimir', key: 'vladimir', aliases: ['vlad', 'vampiro'] },
  { id: 106, name: 'Volibear', key: 'volibear', aliases: ['voli', 'oso'] },
  { id: 19, name: 'Warwick', key: 'warwick', aliases: ['ww', 'lobo'] },
  { id: 498, name: 'Xayah', key: 'xayah', aliases: ['plumas'] },
  { id: 101, name: 'Xerath', key: 'xerath', aliases: [] },
  { id: 5, name: 'Xin Zhao', key: 'xinzhao', aliases: ['xin', 'chinchao'] },
  { id: 157, name: 'Yasuo', key: 'yasuo', aliases: ['hasagi', 'yas'] },
  { id: 777, name: 'Yone', key: 'yone', aliases: [] },
  { id: 83, name: 'Yorick', key: 'yorick', aliases: ['palas'] },
  { id: 350, name: 'Yuumi', key: 'yuumi', aliases: ['yumi', 'gata'] },
  { id: 154, name: 'Zac', key: 'zac', aliases: ['moco', 'gelatina'] },
  { id: 238, name: 'Zed', key: 'zed', aliases: ['sombras'] },
  { id: 221, name: 'Zeri', key: 'zeri', aliases: [] },
  { id: 115, name: 'Ziggs', key: 'ziggs', aliases: ['bombas'] },
  { id: 26, name: 'Zilean', key: 'zilean', aliases: ['reloj'] },
  { id: 142, name: 'Zoe', key: 'zoe', aliases: [] },
  { id: 143, name: 'Zyra', key: 'zyra', aliases: ['plantas'] }
]

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      )
    }
  }
  return dp[m][n]
}

export class ChampionDatabase {
  private static instance: ChampionDatabase
  private champions: ChampionEntry[] = [...KNOWN_CHAMPIONS]

  public static getInstance(): ChampionDatabase {
    if (!ChampionDatabase.instance) {
      ChampionDatabase.instance = new ChampionDatabase()
    }
    return ChampionDatabase.instance
  }

  public updateChampions(dynamicList: Array<{ id: number; name: string }>): void {
    const existingIds = new Set(this.champions.map((c) => c.id))
    for (const champ of dynamicList) {
      if (!existingIds.has(champ.id)) {
        this.champions.push({
          id: champ.id,
          name: champ.name,
          key: normalize(champ.name),
          aliases: []
        })
        existingIds.add(champ.id)
      }
    }
  }

  /** Only a champion with exactly this name or alias: "Jett" is no champion, even if a fuzzy search finds one */
  public findChampion(query: string): ChampionEntry | null {
    const norm = normalize(query)
    if (!norm) return null

    // Exact match on normalized key
    const exact = this.champions.find((c) => c.key === norm)
    if (exact) return exact

    // Exact match on aliases
    const aliasMatch = this.champions.find((c) => c.aliases.some((a) => normalize(a) === norm))
    if (aliasMatch) return aliasMatch

    // Starts with match
    if (norm.length >= 3) {
      const startsWith = this.champions.find((c) => c.key.startsWith(norm))
      if (startsWith) return startsWith
    }

    // Substring inclusion
    if (norm.length >= 4) {
      const contains = this.champions.find((c) => c.key.includes(norm) || c.aliases.some((a) => normalize(a).includes(norm)))
      if (contains) return contains
    }

    // Typo tolerance: Levenshtein distance
    let bestMatch: ChampionEntry | null = null
    let minDistance = Infinity

    for (const champ of this.champions) {
      const dist = levenshteinDistance(norm, champ.key)
      // Allow 1 typo for words of 4-5 chars, 2 typos for 6+ chars
      const allowedTypos = champ.key.length <= 4 ? 1 : 2
      if (dist <= allowedTypos && dist < minDistance) {
        minDistance = dist
        bestMatch = champ
      }

      // Check aliases too
      for (const a of champ.aliases) {
        const aNorm = normalize(a)
        const aDist = levenshteinDistance(norm, aNorm)
        if (aDist <= 1 && aDist < minDistance) {
          minDistance = aDist
          bestMatch = champ
        }
      }
    }

    return bestMatch
  }

  /** Strict lookup, no typo tolerance: used to tell a champion name from an agent name */
  public findExactChampion(query: string): ChampionEntry | null {
    const norm = normalize(query)
    if (!norm) return null
    return this.champions.find((c) => c.key === norm || c.aliases.some((a) => normalize(a) === norm)) || null
  }

  public getById(id: number): ChampionEntry | null {
    return this.champions.find((c) => c.id === id) || null
  }
}

export const championDatabase = ChampionDatabase.getInstance()

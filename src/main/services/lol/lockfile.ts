import * as fs from 'fs'

/** Where Riot says the game is installed, then the usual folders on every drive */
export function leagueLockfileCandidates(
  read: (file: string) => string | null = (file) => {
    try {
      return fs.readFileSync(file, 'utf8')
    } catch {
      return null
    }
  }
): string[] {
  const data = process.env.ProgramData || 'C:\\ProgramData'
  const dirs: string[] = []
  const settings = read(`${data}\\Riot Games\\Metadata\\league_of_legends.live\\league_of_legends.live.product_settings.yaml`)
  const installed = settings?.match(/product_install_full_path:\s*"?([^"\r\n]+)"?/)
  if (installed) dirs.push(installed[1].trim().replace(/\//g, '\\'))
  for (const drive of ['C', 'D', 'E', 'F', 'G', 'H']) {
    dirs.push(`${drive}:\\Riot Games\\League of Legends`, `${drive}:\\Games\\Riot Games\\League of Legends`, `${drive}:\\Program Files\\Riot Games\\League of Legends`)
  }
  return Array.from(new Set(dirs)).map((dir) => `${dir}\\lockfile`)
}

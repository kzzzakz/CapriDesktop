/**
 * The silent installer sometimes crashes as it starts (about 1 run in 5, inside the NSIS System
 * plugin that electron-builder ships), before touching anything. So the update runs from a small
 * script that outlives Capri: it tries again, makes sure she comes back, and if every try fails it
 * reopens the version that is still installed, so an update can never leave the user without her.
 */

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`

export function windowsUpdateScript(installer: string, currentApp: string, startedMarker: string, installerArgs = ['/S', '--updated', '--force-run'], tries = 5): string {
  const args = installerArgs.map(quote).join(',')
  return [
    // She waits for this file before closing: no file means this script never ran
    `Set-Content -Path ${quote(startedMarker)} -Value 'started'`,
    // Capri has to be closed first: the installer would stop to wait for her
    'Start-Sleep -Seconds 3',
    '$installed = $false',
    `foreach ($try in 1..${tries}) {`,
    `  $run = Start-Process -FilePath ${quote(installer)} -ArgumentList ${args} -PassThru`,
    // Without asking for the handle first, PowerShell 5.1 forgets the exit code
    '  $null = $run.Handle',
    '  $run.WaitForExit()',
    '  if ($run.ExitCode -eq 0) { $installed = $true; break }',
    '  Start-Sleep -Seconds 2',
    '}',
    // The installer should have opened her. If it didn't, she's opened from here
    'if ($installed) { Start-Sleep -Seconds 6 }',
    `if (-not (Get-Process -Name ${quote(appProcessName(currentApp))} -ErrorAction SilentlyContinue)) { Start-Process -FilePath ${quote(currentApp)} }`
  ].join('\r\n')
}

function appProcessName(appPath: string): string {
  return (appPath.split(/[\\/]/).pop() || '').replace(/\.exe$/i, '')
}

/**
 * Starts a program that has to keep running after Capri closes. spawn's "detached" isn't enough:
 * PowerShell started that way exits at once, reporting success, without running anything.
 * Going through "start" works and survives her.
 */
export function startIndependently(command: string): { file: string; args: string[] } {
  return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"start "" /b ${command}"`] }
}

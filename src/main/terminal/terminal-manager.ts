import { spawn, ChildProcess } from '../services/hidden-process'
import { windowManager } from '../windows/window-manager'
import { IPC_CHANNELS } from '../ipc/channels'

export class TerminalManager {
  private activeProcess: ChildProcess | null = null

  public execCommand(command: string, cwd: string): void {
    if (this.activeProcess) {
      this.activeProcess.kill()
      this.activeProcess = null
    }

    const isWindows = process.platform === 'win32'
    const shell = isWindows ? 'powershell.exe' : '/bin/bash'
    const shellArgs = isWindows ? ['-NoLogo', '-NoProfile', '-Command', command] : ['-c', command]

    // Announce command execution
    this.sendOutput(`\r\n\x1b[36m[CYBER-SHELL] > \x1b[33m${command}\x1b[0m\r\n`)

    try {
      this.activeProcess = spawn(shell, shellArgs, {
        cwd: cwd || process.cwd(),
        env: process.env,
        shell: false
      })

      this.activeProcess.stdout?.on('data', (data: Buffer) => {
        this.sendOutput(data.toString())
      })

      this.activeProcess.stderr?.on('data', (data: Buffer) => {
        this.sendOutput(`\x1b[31m${data.toString()}\x1b[0m`)
      })

      this.activeProcess.on('close', (code: number) => {
        this.activeProcess = null
        const color = code === 0 ? '\x1b[32m' : '\x1b[31m'
        this.sendOutput(`\r\n${color}[Process exited with code ${code}]\x1b[0m\r\n`)
      })

      this.activeProcess.on('error', (err: Error) => {
        this.activeProcess = null
        this.sendOutput(`\r\n\x1b[31m[Process error: ${err.message}]\x1b[0m\r\n`)
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.sendOutput(`\r\n\x1b[31m[Failed to launch process: ${msg}]\x1b[0m\r\n`)
    }
  }

  public writeInput(data: string): void {
    if (this.activeProcess && this.activeProcess.stdin) {
      this.activeProcess.stdin.write(data)
    }
  }

  public kill(): void {
    if (this.activeProcess) {
      this.activeProcess.kill()
      this.activeProcess = null
      this.sendOutput(`\r\n\x1b[33m[Process terminated by user]\x1b[0m\r\n`)
    }
  }

  private sendOutput(data: string): void {
    windowManager.broadcast(IPC_CHANNELS.TERMINAL_DATA, data)
  }
}

export const terminalManager = new TerminalManager()

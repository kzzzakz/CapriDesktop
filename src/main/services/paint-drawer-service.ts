import { assetPath, scriptPath as scriptPathOf } from './app-paths'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { app } from 'electron'
import { spawn, ChildProcess } from './hidden-process'
import { agentManager } from '../agents/agent-manager'
import { consciousnessService } from './consciousness-service'
import { DrawingPlan } from './paint/types'
import { isWindows } from './platform'

export interface DrawResult {
  success: boolean
  aborted: boolean
  shape: string
  reason?: string
  isCustomPlan?: boolean
}

export class PaintDrawerService {
  private static instance: PaintDrawerService
  private isDrawing = false
  private currentProcess: ChildProcess | null = null

  public static getInstance(): PaintDrawerService {
    if (!PaintDrawerService.instance) {
      PaintDrawerService.instance = new PaintDrawerService()
    }
    return PaintDrawerService.instance
  }

  public getIsDrawing(): boolean {
    return this.isDrawing
  }

  public cancel(): void {
    if (this.currentProcess) {
      try {
        this.currentProcess.kill()
      } catch {}
      this.currentProcess = null
    }
    this.isDrawing = false
  }

  private getAppBasePath(): string {
    try {
      if (app && typeof app.getAppPath === 'function') {
        return app.getAppPath()
      }
    } catch {}
    return process.cwd()
  }

  private async notifyVoiceWarning(subject: string): Promise<void> {
    const lang = consciousnessService.getPreferredLanguage()
    const isEs = lang === 'es'

    const warningPhrase = isEs
      ? `¡Atención choomba! Soltá el mouse un segundo que tomo los mandos de Paint para dibujar "${subject}".`
      : `Hands off the mouse for a second, {name}! Jacking into Paint right now to draw "${subject}".`

    try {
      agentManager.setCompanionState('talking')
      agentManager.setCompanionSpeech(warningPhrase, 4000, true)
    } catch {}

    // Wait 1.8s for TTS announcement to start playing and give user time to release mouse
    await new Promise((r) => setTimeout(r, 1800))
  }

  /**
   * Draws a dynamically planned DrawingPlan on Paint.
   */
  public async drawPlan(plan: DrawingPlan, speed = 1, shouldWarn = false): Promise<DrawResult> {
    if (!isWindows) return { success: false, aborted: false, shape: plan.subject, reason: 'unsupported_platform' }
    if (this.isDrawing) {
      return {
        success: false,
        aborted: true,
        shape: plan.subject,
        reason: 'already_drawing'
      }
    }

    if (shouldWarn) {
      await this.notifyVoiceWarning(plan.subject)
    }

    const tempDir = app && typeof app.getPath === 'function' ? app.getPath('temp') : os.tmpdir()
    const tempFile = path.join(tempDir, `capri_plan_${Date.now()}.json`)

    try {
      fs.writeFileSync(tempFile, JSON.stringify(plan, null, 2), 'utf-8')
    } catch (err: any) {
      console.warn('[PaintDrawerService] Failed to write temporary drawing plan:', err)
      return {
        success: false,
        aborted: false,
        shape: plan.subject,
        reason: 'failed_temp_file'
      }
    }

    const scriptPath = scriptPathOf('paint_drawer.ps1')
    const psArgs = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-JsonFile',
      tempFile,
      '-Speed',
      String(speed)
    ]

    const result = await this.executeProcess(psArgs, plan.subject)

    // Cleanup temp file safely
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile)
      }
    } catch {}

    return { ...result, isCustomPlan: true }
  }

  /**
   * Draws one of the hand-written reference examples (stickman, house, sun)
   */
  public async drawExample(exampleName: 'stickman' | 'house' | 'sun' | string, speed = 1): Promise<DrawResult> {
    const cleanName = exampleName.toLowerCase().trim()
    const basePath = this.getAppBasePath()
    const exampleFile = path.join(assetPath('game_data', 'paint_examples'), `${cleanName}.json`)

    if (fs.existsSync(exampleFile)) {
      try {
        const raw = fs.readFileSync(exampleFile, 'utf-8')
        const plan = JSON.parse(raw) as DrawingPlan
        return await this.drawPlan(plan, speed)
      } catch (err: any) {
        console.warn(`[PaintDrawerService] Error reading example ${cleanName}:`, err)
      }
    }

    // Fallback to procedural shape name
    return await this.draw(cleanName, speed)
  }

  /**
   * Draws a procedural shape or random doodle (legacy / procedural fallback).
   */
  public async draw(requestedShape = 'random', speed = 1): Promise<DrawResult> {
    if (!isWindows) return { success: false, aborted: false, shape: requestedShape, reason: 'unsupported_platform' }
    if (this.isDrawing) {
      return {
        success: false,
        aborted: true,
        shape: requestedShape,
        reason: 'already_drawing'
      }
    }

    // Check if an example file matches this shape
    const cleanName = requestedShape.toLowerCase().trim()
    const candidateExample = path.join(assetPath('game_data', 'paint_examples'), `${cleanName}.json`)
    if (fs.existsSync(candidateExample)) {
      return await this.drawExample(cleanName, speed)
    }

    await this.notifyVoiceWarning(requestedShape)

    const scriptPath = scriptPathOf('paint_drawer.ps1')
    const psArgs = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Shape',
      requestedShape,
      '-Speed',
      String(speed)
    ]

    return await this.executeProcess(psArgs, requestedShape)
  }

  private executeProcess(psArgs: string[], shapeLabel: string): Promise<DrawResult> {
    this.isDrawing = true

    return new Promise<DrawResult>((resolve) => {
      const ps = spawn('powershell.exe', psArgs)
      this.currentProcess = ps

      let stdout = ''
      let stderr = ''

      ps.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      ps.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      ps.on('close', (code) => {
        this.isDrawing = false
        this.currentProcess = null

        if (code !== 0 && !stdout) {
          console.warn('[PaintDrawerService] Process exited with error code:', code, stderr)
          return resolve({
            success: false,
            aborted: false,
            shape: shapeLabel,
            reason: stderr || `Exit code ${code}`
          })
        }

        try {
          const trimmed = stdout.trim()
          const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            return resolve({
              success: !!parsed.success,
              aborted: !!parsed.aborted,
              shape: parsed.shape || shapeLabel,
              reason: parsed.reason
            })
          }
        } catch (e) {
          console.warn('[PaintDrawerService] Failed to parse script output:', stdout, e)
        }

        resolve({
          success: true,
          aborted: false,
          shape: shapeLabel
        })
      })

      ps.on('error', (err) => {
        this.isDrawing = false
        this.currentProcess = null
        console.warn('[PaintDrawerService] Failed to spawn process:', err)
        resolve({
          success: false,
          aborted: false,
          shape: shapeLabel,
          reason: err.message
        })
      })
    })
  }
}

export const paintDrawerService = PaintDrawerService.getInstance()

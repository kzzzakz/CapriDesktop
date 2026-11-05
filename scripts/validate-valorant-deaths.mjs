import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'

const frames = process.argv[2]
if (!frames) throw new Error('Usage: node scripts/validate-valorant-deaths.mjs <calibration-frames> [results.json]')
const source = readFileSync(
  new URL('../src/main/services/game/adapters/valorant/death-vision.ts', import.meta.url),
  'utf8'
)
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
})
const { hasSpectatorHud, observeValorantLife } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
)
const labels = JSON.parse(readFileSync(new URL('fixtures/valorant/calibration-labels.json', import.meta.url), 'utf8'))
const temporary = mkdtempSync(join(tmpdir(), 'capri-valorant-audit-'))
const pixelsPath = join(temporary, 'hud.bgra')
try {
  const names = JSON.parse(
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `
    Add-Type -AssemblyName System.Drawing
    $files = @(Get-ChildItem -LiteralPath $env:CAPRI_CALIB_FRAMES -Filter '*.jpg' | Sort-Object Name)
    $stream = [System.IO.File]::Create($env:CAPRI_CALIB_PIXELS)
    try {
      foreach ($file in $files) {
        $image = [System.Drawing.Bitmap]::FromFile($file.FullName)
        try {
          if ($image.Width -ne 1280 -or $image.Height -ne 720) { throw 'Expected 1280x720 calibration frames' }
          $crop = $image.Clone([System.Drawing.Rectangle]::new(20,650,220,70), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
          try {
            $data = $crop.LockBits([System.Drawing.Rectangle]::new(0,0,220,70), [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $bytes = New-Object byte[] 61600
            [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
            $crop.UnlockBits($data)
            $stream.Write($bytes,0,$bytes.Length)
          } finally { $crop.Dispose() }
        } finally { $image.Dispose() }
      }
    } finally { $stream.Dispose() }
    ConvertTo-Json -InputObject @($files.Name) -Compress
  `
      ],
      {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 120000,
        env: { ...process.env, CAPRI_CALIB_FRAMES: frames, CAPRI_CALIB_PIXELS: pixelsPath }
      }
    )
      .trim()
      .replace(/^\uFEFF/, '')
  )
  assert.equal(names.length, 494)
  const pixels = readFileSync(pixelsPath)
  assert.equal(pixels.length, names.length * 61600)
  const confusion = { TP: 0, FP: 0, TN: 0, FN: 0 }
  const detections = []
  let tracker = null
  const rows = names.map((file, index) => {
    const expectedDead = labels.deadIntervals.some(([start, end]) => file >= start && file <= end)
    const detectedDead = hasSpectatorHud(pixels.subarray(index * 61600, (index + 1) * 61600), 220, 70)
    confusion[expectedDead ? (detectedDead ? 'TP' : 'FN') : detectedDead ? 'FP' : 'TN']++
    if (file >= labels.roundStarts[0] && file < labels.postMatchStart) {
      const round = String(labels.roundStarts.filter((start) => file >= start).length)
      const observation = observeValorantLife(tracker, round, detectedDead)
      tracker = observation.tracker
      if (observation.died) detections.push(file)
    }
    return { file, expectedDead, detectedDead }
  })
  const result = { confusion, detections, rows }
  if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n')
  console.log(
    JSON.stringify(
      {
        confusion,
        detections,
        falsePositives: rows.filter((r) => !r.expectedDead && r.detectedDead).map((r) => r.file),
        falseNegatives: rows.filter((r) => r.expectedDead && !r.detectedDead).map((r) => r.file)
      },
      null,
      2
    )
  )
} finally {
  try {
    unlinkSync(pixelsPath)
  } finally {
    rmdirSync(temporary)
  }
}

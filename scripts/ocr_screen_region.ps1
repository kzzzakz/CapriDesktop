param(
    [Parameter(Mandatory=$true)][int]$X,
    [Parameter(Mandatory=$true)][int]$Y,
    [Parameter(Mandatory=$true)][int]$Width,
    [Parameter(Mandatory=$true)][int]$Height,
    [string]$Language = ''
)

# Reads the text in a region of the screen with the OCR built into Windows (Windows.Media.Ocr):
# no model, no network, about a second. Coordinates are physical pixels of the primary display.
# Prints JSON: { "lines": [ { "text", "x", "y", "w", "h" } ] } with boxes in those same pixels.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -Namespace CapriOcr -Name Native -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'

$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Await($op, [Type]$resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}

try {
    [CapriOcr.Native]::SetProcessDPIAware() | Out-Null

    $engine = $null
    if ($Language) {
        foreach ($lang in [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages) {
            if ($lang.LanguageTag -like "$Language*") { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang); break }
        }
    }
    if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
    if (-not $engine) {
        $first = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Select-Object -First 1
        if ($first) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($first) }
    }
    if (-not $engine) { throw 'No Windows OCR language is installed' }

    $W = [Math]::Max(10, $Width)
    $H = [Math]::Max(10, $Height)
    $shot = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($shot)
    $g.CopyFromScreen($X, $Y, 0, 0, (New-Object System.Drawing.Size($W, $H)))
    $g.Dispose()

    # Screen text is small: twice the size reads far better, within what the engine accepts
    $max = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
    $scale = [Math]::Min(2.0, [Math]::Min($max / $W, $max / $H))
    $img = $shot
    if ([Math]::Abs($scale - 1.0) -gt 0.05) {
        $img = New-Object System.Drawing.Bitmap([int]($W * $scale), [int]($H * $scale))
        $g2 = [System.Drawing.Graphics]::FromImage($img)
        $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g2.DrawImage($shot, 0, 0, $img.Width, $img.Height)
        $g2.Dispose()
    } else {
        $scale = 1.0
    }

    $ms = New-Object System.IO.MemoryStream
    $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $ms.Position = 0
    $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])

    $lines = @()
    foreach ($line in $result.Lines) {
        $minX = [double]::MaxValue; $minY = [double]::MaxValue; $maxX = 0.0; $maxY = 0.0
        foreach ($word in $line.Words) {
            $r = $word.BoundingRect
            $minX = [Math]::Min($minX, $r.X); $minY = [Math]::Min($minY, $r.Y)
            $maxX = [Math]::Max($maxX, $r.X + $r.Width); $maxY = [Math]::Max($maxY, $r.Y + $r.Height)
        }
        if ($line.Words.Count -eq 0) { continue }
        $lines += [pscustomobject]@{
            text = $line.Text
            x = [int]($minX / $scale)
            y = [int]($minY / $scale)
            w = [int](($maxX - $minX) / $scale)
            h = [int](($maxY - $minY) / $scale)
        }
    }
    $json = ConvertTo-Json -InputObject @{ language = $engine.RecognizerLanguage.LanguageTag; lines = @($lines) } -Depth 4 -Compress
    [Console]::Write($json)
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}

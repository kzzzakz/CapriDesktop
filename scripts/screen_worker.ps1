# Capri's eyes, kept open: one PowerShell that stays running and answers one request per line.
# Starting PowerShell, compiling the capture code and loading the Windows OCR took 1.5s for a
# screenshot and 3.5s for an OCR every single time; here that is paid once, and a look at the
# screen (screenshot + text + window in front, all from the same instant) takes a fraction of that.
#
# In  (stdin, one JSON per line):  { id, x, y, w, h, maxSide, quality, jpeg, ocr, fg, lang }
#                                  x/y/w/h are physical pixels of the primary display
# Out (stdout, one JSON per line): { id, jpeg, lines: [ { text, x, y, w, h } ], fg: { title, process }, ms }
#                                  or { id, error }. The first line is { ready: true, ocr: bool }.

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public class CapriScreenWorker {
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);
    [DllImport("gdi32.dll")] static extern bool BitBlt(IntPtr dest, int dx, int dy, int w, int h, IntPtr src, int sx, int sy, int rop);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    static ImageCodecInfo jpegCodec;

    /** The region as it is on screen right now, clamped to the display */
    public static Bitmap Grab(int x, int y, int width, int height) {
        int screenW = GetSystemMetrics(0);
        int screenH = GetSystemMetrics(1);
        int safeX = Math.Max(0, Math.Min(x, screenW - 10));
        int safeY = Math.Max(0, Math.Min(y, screenH - 10));
        int safeW = Math.Max(10, Math.Min(width, screenW - safeX));
        int safeH = Math.Max(10, Math.Min(height, screenH - safeY));
        Bitmap bmp = new Bitmap(safeW, safeH, PixelFormat.Format24bppRgb);
        IntPtr src = GetDC(IntPtr.Zero);
        using (Graphics g = Graphics.FromImage(bmp)) {
            IntPtr dest = g.GetHdc();
            BitBlt(dest, 0, 0, safeW, safeH, src, safeX, safeY, 0x00CC0020);
            g.ReleaseHdc(dest);
        }
        ReleaseDC(IntPtr.Zero, src);
        return bmp;
    }

    public static string Jpeg(Bitmap shot, int maxSide, long quality) {
        Bitmap outBmp = shot;
        if (maxSide > 0 && (shot.Width > maxSide || shot.Height > maxSide)) {
            double k = (double)maxSide / Math.Max(shot.Width, shot.Height);
            outBmp = new Bitmap(shot, new Size(Math.Max(1, (int)Math.Round(shot.Width * k)), Math.Max(1, (int)Math.Round(shot.Height * k))));
        }
        try {
            if (jpegCodec == null) {
                foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders()) {
                    if (codec.FormatID == ImageFormat.Jpeg.Guid) { jpegCodec = codec; break; }
                }
            }
            using (MemoryStream ms = new MemoryStream()) {
                EncoderParameters p = new EncoderParameters(1);
                p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
                outBmp.Save(ms, jpegCodec, p);
                return Convert.ToBase64String(ms.ToArray());
            }
        } finally {
            if (!ReferenceEquals(outBmp, shot)) outBmp.Dispose();
        }
    }

    /** The shot enlarged for the OCR (screen text is small), as an uncompressed BMP: nothing to encode */
    public static MemoryStream ForOcr(Bitmap shot, double scale) {
        Bitmap img = shot;
        if (Math.Abs(scale - 1.0) > 0.05) {
            img = new Bitmap((int)(shot.Width * scale), (int)(shot.Height * scale), PixelFormat.Format24bppRgb);
            using (Graphics g = Graphics.FromImage(img)) {
                g.InterpolationMode = InterpolationMode.Bilinear;
                g.PixelOffsetMode = PixelOffsetMode.Half;
                g.DrawImage(shot, 0, 0, img.Width, img.Height);
            }
        }
        try {
            MemoryStream ms = new MemoryStream();
            img.Save(ms, ImageFormat.Bmp);
            ms.Position = 0;
            return ms;
        } finally {
            if (!ReferenceEquals(img, shot)) img.Dispose();
        }
    }

    /** A tiny grayscale picture (one byte per pixel) to tell whether the screen changed, even by a line of typing */
    public static string Thumb(Bitmap shot, int w, int h) {
        using (Bitmap small = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
            using (Graphics g = Graphics.FromImage(small)) {
                g.InterpolationMode = InterpolationMode.HighQualityBilinear;
                g.DrawImage(shot, 0, 0, w, h);
            }
            BitmapData data = small.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
            byte[] raw = new byte[data.Stride * h];
            Marshal.Copy(data.Scan0, raw, 0, raw.Length);
            small.UnlockBits(data);
            byte[] gray = new byte[w * h];
            for (int y = 0; y < h; y++) {
                for (int x = 0; x < w; x++) {
                    int i = y * data.Stride + x * 3;
                    gray[y * w + x] = (byte)((raw[i] * 29 + raw[i + 1] * 150 + raw[i + 2] * 77) >> 8);
                }
            }
            return Convert.ToBase64String(gray);
        }
    }

    public static string[] Foreground() {
        IntPtr hwnd = GetForegroundWindow();
        uint pid = 0;
        GetWindowThreadProcessId(hwnd, out pid);
        StringBuilder text = new StringBuilder(512);
        GetWindowText(hwnd, text, 512);
        string name = "";
        try { name = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch {}
        return new string[] { text.ToString(), name };
    }
}
"@

[CapriScreenWorker]::SetProcessDPIAware() | Out-Null

# The Windows OCR. Without it (no OCR language installed) the worker still takes screenshots
$ocrReady = $false
$engines = @{}
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime]
    $null = [Windows.Globalization.Language, Windows.Foundation, ContentType = WindowsRuntime]
    $asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1
    $ocrMax = [Windows.Media.Ocr.OcrEngine]::MaxImageDimension
    $ocrReady = $true
} catch {}

function Await($op, [Type]$resultType) {
    $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
}

function Get-OcrEngine([string]$language) {
    if ($engines.ContainsKey($language)) { return $engines[$language] }
    $engine = $null
    if ($language) {
        foreach ($lang in [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages) {
            if ($lang.LanguageTag -like "$language*") { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($lang); break }
        }
    }
    if (-not $engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
    if (-not $engine) {
        $first = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages | Select-Object -First 1
        if ($first) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage($first) }
    }
    $engines[$language] = $engine
    return $engine
}

function Read-Text($shot, [string]$language) {
    $engine = Get-OcrEngine $language
    if (-not $engine) { throw 'No Windows OCR language is installed' }
    $scale = [Math]::Min(2.0, [Math]::Min($ocrMax / $shot.Width, $ocrMax / $shot.Height))
    if ([Math]::Abs($scale - 1.0) -le 0.05) { $scale = 1.0 }
    $ms = [CapriScreenWorker]::ForOcr($shot, $scale)
    try {
        $stream = [System.IO.WindowsRuntimeStreamExtensions]::AsRandomAccessStream($ms)
        $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
        $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $bitmap.Dispose()
    } finally {
        $ms.Dispose()
    }
    $lines = New-Object System.Collections.ArrayList
    foreach ($line in $result.Lines) {
        if ($line.Words.Count -eq 0) { continue }
        $minX = [double]::MaxValue; $minY = [double]::MaxValue; $maxX = 0.0; $maxY = 0.0
        foreach ($word in $line.Words) {
            $r = $word.BoundingRect
            $minX = [Math]::Min($minX, $r.X); $minY = [Math]::Min($minY, $r.Y)
            $maxX = [Math]::Max($maxX, $r.X + $r.Width); $maxY = [Math]::Max($maxY, $r.Y + $r.Height)
        }
        $null = $lines.Add(@{
            text = $line.Text
            x = [int]($minX / $scale); y = [int]($minY / $scale)
            w = [int](($maxX - $minX) / $scale); h = [int](($maxY - $minY) / $scale)
        })
    }
    return ,$lines
}

function Send($obj) {
    [Console]::Out.WriteLine((ConvertTo-Json -InputObject $obj -Depth 5 -Compress))
    [Console]::Out.Flush()
}

Send @{ ready = $true; ocr = $ocrReady }

while ($true) {
    $line = [Console]::In.ReadLine()
    # Capri closed (or closed the pipe): nothing left to look at
    if ($null -eq $line) { break }
    if (-not $line.Trim()) { continue }
    $id = 0
    $shot = $null
    try {
        $req = $line | ConvertFrom-Json
        $id = $req.id
        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        $out = @{ id = $id }
        if ($req.jpeg -or $req.ocr -or $req.thumb) { $shot = [CapriScreenWorker]::Grab([int]$req.x, [int]$req.y, [int]$req.w, [int]$req.h) }
        if ($req.fg) {
            $fg = [CapriScreenWorker]::Foreground()
            $out.fg = @{ title = $fg[0]; process = $fg[1] }
        }
        if ($req.jpeg) {
            $quality = if ($req.quality) { [long]$req.quality } else { 85 }
            $out.jpeg = [CapriScreenWorker]::Jpeg($shot, [int]$req.maxSide, $quality)
        }
        if ($req.thumb) { $out.thumb = [CapriScreenWorker]::Thumb($shot, 128, 72) }
        if ($req.ocr) {
            if (-not $ocrReady) { throw 'Windows OCR is not available' }
            $out.lines = Read-Text $shot ([string]$req.lang)
        }
        $out.ms = [int]$watch.ElapsedMilliseconds
        Send $out
    } catch {
        Send @{ id = $id; error = "$($_.Exception.Message)" }
    } finally {
        if ($shot) { $shot.Dispose() }
    }
}

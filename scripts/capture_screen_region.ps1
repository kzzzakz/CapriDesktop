param(
    [Parameter(Mandatory=$true)][int]$X,
    [Parameter(Mandatory=$true)][int]$Y,
    [Parameter(Mandatory=$true)][int]$Width,
    [Parameter(Mandatory=$true)][int]$Height,
    [int]$MaxSide = 1024,
    [int]$Quality = 85
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public class NativeScreenCapture {
    [DllImport("user32.dll")]
    public static extern IntPtr GetDC(IntPtr hwnd);

    [DllImport("user32.dll")]
    public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

    [DllImport("gdi32.dll")]
    public static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, int dwRop);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public static byte[] Capture(int x, int y, int width, int height, int maxSide, long quality) {
        SetProcessDPIAware();
        int screenW = GetSystemMetrics(0); // SM_CXSCREEN
        int screenH = GetSystemMetrics(1); // SM_CYSCREEN

        int safeX = Math.Max(0, Math.Min(x, screenW - 10));
        int safeY = Math.Max(0, Math.Min(y, screenH - 10));
        int safeW = Math.Max(10, Math.Min(width, screenW - safeX));
        int safeH = Math.Max(10, Math.Min(height, screenH - safeY));

        IntPtr hdcSrc = GetDC(IntPtr.Zero);
        using (Bitmap fullBmp = new Bitmap(safeW, safeH, PixelFormat.Format24bppRgb)) {
            using (Graphics g = Graphics.FromImage(fullBmp)) {
                IntPtr hdcDest = g.GetHdc();
                BitBlt(hdcDest, 0, 0, safeW, safeH, hdcSrc, safeX, safeY, 0x00CC0020); // SRCCOPY
                g.ReleaseHdc(hdcDest);
            }
            ReleaseDC(IntPtr.Zero, hdcSrc);

            Bitmap outBmp = fullBmp;
            bool scaled = false;
            if (maxSide > 0 && (safeW > maxSide || safeH > maxSide)) {
                int outW, outH;
                if (safeW >= safeH) {
                    outW = maxSide;
                    outH = (int)Math.Round((double)safeH * maxSide / safeW);
                } else {
                    outH = maxSide;
                    outW = (int)Math.Round((double)safeW * maxSide / safeH);
                }
                outBmp = new Bitmap(fullBmp, new Size(outW, outH));
                scaled = true;
            }

            try {
                using (MemoryStream ms = new MemoryStream()) {
                    ImageCodecInfo jpgEncoder = null;
                    foreach (ImageCodecInfo codec in ImageCodecInfo.GetImageEncoders()) {
                        if (codec.FormatID == ImageFormat.Jpeg.Guid) {
                            jpgEncoder = codec;
                            break;
                        }
                    }
                    if (jpgEncoder != null) {
                        EncoderParameters encoderParams = new EncoderParameters(1);
                        encoderParams.Param[0] = new EncoderParameter(Encoder.Quality, quality);
                        outBmp.Save(ms, jpgEncoder, encoderParams);
                    } else {
                        outBmp.Save(ms, ImageFormat.Jpeg);
                    }
                    return ms.ToArray();
                }
            } finally {
                if (scaled && outBmp != null) {
                    outBmp.Dispose();
                }
            }
        }
    }
}
"@

try {
    $bytes = [NativeScreenCapture]::Capture($X, $Y, $Width, $Height, $MaxSide, [long]$Quality)
    [Console]::Write([Convert]::ToBase64String($bytes))
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}

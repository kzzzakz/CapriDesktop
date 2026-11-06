param(
    [Parameter(Mandatory=$true)][long]$WindowId,
    [ValidateRange(1,4096)][int]$Width = 768,
    [ValidateRange(1,4096)][int]$Height = 432
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CapriGameCapture {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@

[void][CapriGameCapture]::SetProcessDPIAware()
$window = [IntPtr]$WindowId
if ([CapriGameCapture]::GetForegroundWindow() -ne $window) { exit }
$rect = New-Object CapriGameCapture+Rect
$origin = New-Object CapriGameCapture+Point
if (-not [CapriGameCapture]::GetClientRect($window, [ref]$rect)) { exit }
if (-not [CapriGameCapture]::ClientToScreen($window, [ref]$origin)) { exit }
$clientWidth = $rect.Right - $rect.Left
$clientHeight = $rect.Bottom - $rect.Top
if ($clientWidth -lt 1 -or $clientHeight -lt 1 -or $clientWidth -gt 8192 -or $clientHeight -gt 8192) { exit }

$bitmap = $graphics = $scaled = $stream = $null
try {
    $bitmap = New-Object System.Drawing.Bitmap($clientWidth, $clientHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, $bitmap.Size)
    if ([CapriGameCapture]::GetForegroundWindow() -ne $window) { exit }
    $scale = [Math]::Min($Width / $clientWidth, $Height / $clientHeight)
    $size = New-Object System.Drawing.Size([Math]::Max(1, [int]($clientWidth * $scale)), [Math]::Max(1, [int]($clientHeight * $scale)))
    $scaled = New-Object System.Drawing.Bitmap($bitmap, $size)
    $stream = New-Object System.IO.MemoryStream
    $scaled.Save($stream, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    [Console]::Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
    if ($stream) { $stream.Dispose() }
    if ($scaled) { $scaled.Dispose() }
    if ($graphics) { $graphics.Dispose() }
    if ($bitmap) { $bitmap.Dispose() }
}

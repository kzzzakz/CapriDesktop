Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public class CapriForegroundWindow {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
}
"@

$result = @{ Title = ''; Process = ''; Path = ''; Pid = 0 }
try {
    $hwnd = [CapriForegroundWindow]::GetForegroundWindow()
    $id = [uint32]0
    [void][CapriForegroundWindow]::GetWindowThreadProcessId($hwnd, [ref]$id)
    $text = New-Object System.Text.StringBuilder 512
    [void][CapriForegroundWindow]::GetWindowText($hwnd, $text, 512)
    $proc = Get-Process -Id $id -ErrorAction Stop
    $exe = $proc.Path
    if (-not $exe) { $exe = (Get-CimInstance Win32_Process -Filter "ProcessId=$id").ExecutablePath }
    $result = @{ Title = $text.ToString(); Process = $proc.ProcessName; Path = "$exe"; Pid = [int]$id; WindowId = $hwnd.ToInt64().ToString() }
} catch {}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$result | ConvertTo-Json -Compress

param(
    [Parameter(Mandatory=$true)]
    [int]$ParentPid
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public class CapriForegroundWatcher {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    public static volatile bool InputClosed;

    public static void WatchInput() {
        var thread = new Thread(() => {
            try { while (Console.In.Read() != -1) {} } catch {}
            InputClosed = true;
        });
        thread.IsBackground = true;
        thread.Start();
    }
}
"@

$parent = [System.Diagnostics.Process]::GetProcessById($ParentPid)
[CapriForegroundWatcher]::WatchInput()
$lastWindow = -1L
$lastProcess = -1L

try {
    while (-not [CapriForegroundWatcher]::InputClosed) {
        $parent.Refresh()
        if ($parent.HasExited) { break }
        $hwnd = [CapriForegroundWatcher]::GetForegroundWindow()
        $processId = [uint32]0
        [void][CapriForegroundWatcher]::GetWindowThreadProcessId($hwnd, [ref]$processId)
        $windowId = $hwnd.ToInt64()
        if ($windowId -ne $lastWindow -or $processId -ne $lastProcess) {
            $lastWindow = $windowId
            $lastProcess = $processId
            $result = @{ Title = ''; Process = ''; Path = ''; Pid = 0; WindowId = "$windowId" }
            try {
                $text = New-Object System.Text.StringBuilder 512
                [void][CapriForegroundWatcher]::GetWindowText($hwnd, $text, 512)
                $proc = Get-Process -Id $processId
                $exe = $proc.Path
                if (-not $exe) { $exe = (Get-CimInstance Win32_Process -Filter "ProcessId=$processId").ExecutablePath }
                $result = @{ Title = $text.ToString(); Process = $proc.ProcessName; Path = "$exe"; Pid = [int]$processId; WindowId = "$windowId" }
            } catch {}
            [Console]::WriteLine(($result | ConvertTo-Json -Compress))
            [Console]::Out.Flush()
        }
        Start-Sleep -Milliseconds 350
    }
} finally {
    $parent.Dispose()
}

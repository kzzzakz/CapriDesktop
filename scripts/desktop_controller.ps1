param(
    [Parameter(Mandatory=$true)]
    [string]$Action,
    [string]$Direction = "down",
    [int]$Amount = 360,
    [string]$Key = "down",
    [int]$X = -1,
    [int]$Y = -1,
    [string]$Keyword = "youtube"
)

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class DesktopController {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    public struct POINT {
        public int X;
        public int Y;
    }

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP   = 0x0004;
    public const uint MOUSEEVENTF_WHEEL    = 0x0800;

    public const byte VK_SPACE    = 0x20;
    public const byte VK_PRIOR    = 0x21; // Page Up
    public const byte VK_NEXT     = 0x22; // Page Down
    public const byte VK_UP       = 0x26;
    public const byte VK_DOWN     = 0x28;
    public const byte VK_RETURN   = 0x0D;
    public const byte VK_ESCAPE   = 0x1B;
    public const byte VK_J        = 0x4A;
    public const byte VK_K        = 0x4B;
    public const byte VK_L        = 0x4C;
    public const byte VK_M        = 0x4D;

    public static void Scroll(string direction, int amount) {
        int delta = (direction.ToLower() == "up") ? Math.Abs(amount) : -Math.Abs(amount);
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
    }

    public static void PressKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        Thread.Sleep(60);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }

    public static void Click(int x, int y) {
        if (x >= 0 && y >= 0) {
            SetCursorPos(x, y);
            Thread.Sleep(30);
        }
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(40);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    public static void DoubleClick(int x, int y) {
        if (x >= 0 && y >= 0) {
            SetCursorPos(x, y);
            Thread.Sleep(30);
        }
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(70);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(30);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
    }

    public static void ClickCenter() {
        int screenWidth = GetSystemMetrics(0);  // SM_CXSCREEN
        int screenHeight = GetSystemMetrics(1); // SM_CYSCREEN
        Click(screenWidth / 2, screenHeight / 2);
    }

    public static void DoubleClickCenter() {
        int screenWidth = GetSystemMetrics(0);
        int screenHeight = GetSystemMetrics(1);
        DoubleClick(screenWidth / 2, screenHeight / 2);
    }
}
"@

try {
    if (-not ([System.Management.Automation.PSTypeName]'DesktopController').Type) {
        Add-Type -TypeDefinition $code -ErrorAction Stop
    }

    switch ($Action.ToLower()) {
        "scroll" {
            [DesktopController]::Scroll($Direction, $Amount)
            Write-Output "SCROLLED_$Direction"
        }
        "key" {
            $vk = switch ($Key.ToLower()) {
                "down"     { [DesktopController]::VK_DOWN }
                "up"       { [DesktopController]::VK_UP }
                "space"    { [DesktopController]::VK_SPACE }
                "enter"    { [DesktopController]::VK_RETURN }
                "pagedown" { [DesktopController]::VK_NEXT }
                "pageup"   { [DesktopController]::VK_PRIOR }
                "esc"      { [DesktopController]::VK_ESCAPE }
                "j"        { [DesktopController]::VK_J }
                "k"        { [DesktopController]::VK_K }
                "l"        { [DesktopController]::VK_L }
                "m"        { [DesktopController]::VK_M }
                default    { [DesktopController]::VK_DOWN }
            }
            [DesktopController]::PressKey($vk)
            Write-Output "KEY_PRESSED_$Key"
        }
        "click" {
            if ($X -ge 0 -and $Y -ge 0) {
                [DesktopController]::Click($X, $Y)
            } else {
                [DesktopController]::ClickCenter()
            }
            Write-Output "CLICKED"
        }
        "doubleclick" {
            if ($X -ge 0 -and $Y -ge 0) {
                [DesktopController]::DoubleClick($X, $Y)
            } else {
                [DesktopController]::DoubleClickCenter()
            }
            Write-Output "DOUBLE_CLICKED"
        }
        "tiktok_next" {
            [DesktopController]::PressKey([DesktopController]::VK_DOWN)
            Write-Output "TIKTOK_NEXT"
        }
        "tiktok_prev" {
            [DesktopController]::PressKey([DesktopController]::VK_UP)
            Write-Output "TIKTOK_PREV"
        }
        "tiktok_like" {
            [DesktopController]::PressKey([DesktopController]::VK_L)
            Write-Output "TIKTOK_LIKED"
        }
        "tiktok_pause" {
            [DesktopController]::PressKey([DesktopController]::VK_SPACE)
            Write-Output "TIKTOK_PAUSED"
        }
        "focus_browser" {
            $activated = $false
            try {
                $ws = New-Object -ComObject WScript.Shell

                # 1. First attempt: If Keyword or "YouTube" matches any active window title directly
                if ($Keyword -and $ws.AppActivate($Keyword)) {
                    $activated = $true
                } elseif ($ws.AppActivate("YouTube")) {
                    $activated = $true
                }

                # 2. Second attempt: Find the browser's real primary window (MainWindowHandle != 0)
                if (-not $activated) {
                    $browserNames = @('chrome', 'msedge', 'opera', 'brave', 'firefox')
                    foreach ($name in $browserNames) {
                        $procs = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
                        foreach ($p in $procs) {
                            if ($ws.AppActivate($p.Id)) {
                                $activated = $true
                                break
                            }
                        }
                        if ($activated) { break }
                    }
                }
            } catch {
                # Fallback silently on COM error
            }

            if ($activated) {
                Write-Output "FOCUSED_BROWSER"
            } else {
                Write-Output "NO_BROWSER_FOCUSED"
            }
        }
        default {
            Write-Error "Unknown action: $Action"
            exit 1
        }
    }
    exit 0
} catch {
    Write-Error $_
    exit 1
}

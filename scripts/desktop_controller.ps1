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
using System.Text;
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

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

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

    public const int SW_RESTORE   = 9;
    public const int SW_SHOW      = 5;

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

    public static bool FocusWindow(IntPtr hWnd) {
        if (hWnd == IntPtr.Zero) return false;
        if (IsIconic(hWnd)) {
            ShowWindow(hWnd, SW_RESTORE);
        } else {
            ShowWindow(hWnd, SW_SHOW);
        }
        // Pulse Alt key to bypass Windows SetForegroundWindow lock
        keybd_event(0x12, 0, 0, UIntPtr.Zero);
        keybd_event(0x12, 0, 2, UIntPtr.Zero);
        BringWindowToTop(hWnd);
        return SetForegroundWindow(hWnd);
    }

    public static bool FocusBrowserOrTitle(string keyword) {
        IntPtr foundHwnd = IntPtr.Zero;
        string kw = (keyword ?? "").ToLower();

        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(512);
                GetWindowText(hWnd, sb, 512);
                string title = sb.ToString();
                if (!string.IsNullOrWhiteSpace(title)) {
                    string lowerTitle = title.ToLower();
                    if (!string.IsNullOrEmpty(kw) && lowerTitle.Contains(kw)) {
                        foundHwnd = hWnd;
                        return false;
                    }
                    if (lowerTitle.Contains("youtube") || lowerTitle.Contains("chrome") || lowerTitle.Contains("edge") || lowerTitle.Contains("opera") || lowerTitle.Contains("firefox") || lowerTitle.Contains("brave")) {
                        if (foundHwnd == IntPtr.Zero) {
                            foundHwnd = hWnd;
                        }
                    }
                }
            }
            return true;
        }, IntPtr.Zero);

        if (foundHwnd != IntPtr.Zero) {
            return FocusWindow(foundHwnd);
        }
        return false;
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
            $focused = [DesktopController]::FocusBrowserOrTitle($Keyword)
            if ($focused) {
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

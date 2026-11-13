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

    // The wheel goes to the window under the pointer, so it is put over the page first. In
    // notches of 120 like a real wheel: one huge delta is ignored or clamped by some browsers.
    public static void Scroll(string direction, int amount, int x, int y) {
        if (x >= 0 && y >= 0) {
            SetCursorPos(x, y);
            Thread.Sleep(40);
        }
        int notches = Math.Max(1, (int)Math.Round(Math.Abs(amount) / 120.0));
        int delta = (direction.ToLower() == "up") ? 120 : -120;
        for (int i = 0; i < notches; i++) {
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
            Thread.Sleep(25);
        }
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

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
    private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_SHOWWINDOW = 0x0040;
    private const int SW_RESTORE = 9;

    public static bool BringToFront(IntPtr handle) {
        if (handle == IntPtr.Zero) return false;

        // Only a minimized window: SW_RESTORE takes a maximized one out of full size (a windowed browser)
        if (IsIconic(handle)) ShowWindow(handle, SW_RESTORE);

        // 1. Momentarily force TopMost to bypass Z-order foreground lock
        SetWindowPos(handle, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW);

        // 2. Attach thread input to current foreground thread to get official focus rights
        IntPtr foreWindow = GetForegroundWindow();
        uint forePid;
        uint foreThread = GetWindowThreadProcessId(foreWindow, out forePid);
        uint targetPid;
        uint targetThread = GetWindowThreadProcessId(handle, out targetPid);
        uint currentThread = GetCurrentThreadId();

        bool attachedFore = false;
        bool attachedTarget = false;

        if (foreThread != 0 && foreThread != currentThread) {
            attachedFore = AttachThreadInput(currentThread, foreThread, true);
        }
        if (targetThread != 0 && targetThread != currentThread) {
            attachedTarget = AttachThreadInput(currentThread, targetThread, true);
        }

        bool result = SetForegroundWindow(handle);

        if (attachedTarget) {
            AttachThreadInput(currentThread, targetThread, false);
        }
        if (attachedFore) {
            AttachThreadInput(currentThread, foreThread, false);
        }

        // 3. Drop TopMost so the browser behaves normally without staying pinned
        SetWindowPos(handle, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE);

        return result;
    }
}
"@

try {
    if (-not ([System.Management.Automation.PSTypeName]'DesktopController').Type) {
        Add-Type -TypeDefinition $code -ErrorAction Stop
    }

    switch ($Action.ToLower()) {
        "scroll" {
            [DesktopController]::Scroll($Direction, $Amount, $X, $Y)
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
        { $_ -in @("tiktok_next", "tiktok_prev", "tiktok_like", "tiktok_pause") } {
            # TikTok's own shortcuts (down/up: next/previous, L: like, space: pause) only reach it when
            # its tab is the one in front. Only a browser window showing TikTok gets the key, and only
            # once it really is the foreground window: a stray "L" or arrow in another app would type
            # into it. Prints the action done, NO_TIKTOK or TIKTOK_NOT_IN_FRONT.
            $vk = switch ($Action.ToLower()) {
                "tiktok_next"  { [DesktopController]::VK_DOWN }
                "tiktok_prev"  { [DesktopController]::VK_UP }
                "tiktok_like"  { [DesktopController]::VK_L }
                "tiktok_pause" { [DesktopController]::VK_SPACE }
            }
            $browserNames = @('chrome', 'msedge', 'opera', 'brave', 'firefox', 'vivaldi')
            $tiktok = Get-Process -ErrorAction SilentlyContinue | Where-Object {
                $browserNames -contains $_.ProcessName.ToLower() -and $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle -match 'TikTok'
            } | Select-Object -First 1
            if (-not $tiktok) {
                Write-Output "NO_TIKTOK"
            } else {
                $hwnd = $tiktok.MainWindowHandle
                if ([DesktopController]::GetForegroundWindow() -ne $hwnd) {
                    [DesktopController]::BringToFront($hwnd) | Out-Null
                    Start-Sleep -Milliseconds 150
                }
                if ([DesktopController]::GetForegroundWindow() -ne $hwnd) {
                    Write-Output "TIKTOK_NOT_IN_FRONT"
                } else {
                    [DesktopController]::PressKey($vk)
                    Write-Output $Action.ToUpper()
                }
            }
        }
        "move" {
            if ($X -ge 0 -and $Y -ge 0) { [DesktopController]::SetCursorPos($X, $Y) | Out-Null }
            Write-Output "MOVED"
        }
        { $_ -in @("focus_youtube_tab", "focus_tab") } {
            # An open YouTube tab (or the site in -Keyword, with focus_tab), so she doesn't open another one. A browser window's title is its
            # active tab; the other tabs are read through UI Automation, as a screen reader would.
            # Prints the title of the tab now in front, or NO_YOUTUBE_TAB.
            $site = if ($Action.ToLower() -eq 'focus_tab' -and $Keyword) { [regex]::Escape($Keyword) } else { 'YouTube' }
            $found = $null
            $browserNames = @('chrome', 'msedge', 'opera', 'brave', 'firefox', 'vivaldi')
            $browsers = Get-Process -ErrorAction SilentlyContinue | Where-Object { $browserNames -contains $_.ProcessName.ToLower() -and $_.MainWindowHandle -ne [IntPtr]::Zero }
            $front = $browsers | Where-Object { $_.MainWindowTitle -match $site } | Select-Object -First 1
            if ($front) {
                [DesktopController]::BringToFront($front.MainWindowHandle) | Out-Null
                $found = $front.MainWindowTitle
            } else {
                try {
                    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
                    $tabCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
                    foreach ($b in $browsers) {
                        $win = [System.Windows.Automation.AutomationElement]::FromHandle($b.MainWindowHandle)
                        $tab = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCond) | Where-Object { $_.Current.Name -match $site } | Select-Object -First 1
                        if ($tab) {
                            [DesktopController]::BringToFront($b.MainWindowHandle) | Out-Null
                            $pattern = $null
                            if ($tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) {
                                $pattern.Select()
                            } else {
                                $r = $tab.Current.BoundingRectangle
                                [DesktopController]::Click([int]($r.X + $r.Width / 2), [int]($r.Y + $r.Height / 2))
                            }
                            $found = $tab.Current.Name
                            break
                        }
                    }
                } catch {}
            }
            if ($found) { Write-Output $found } else { Write-Output "NO_YOUTUBE_TAB" }
        }
        "open_url_here" {
            # Goes to an address in the browser tab in front: address bar, type, Enter
            $ws = New-Object -ComObject WScript.Shell
            $ws.SendKeys('^l')
            Start-Sleep -Milliseconds 150
            $ws.SendKeys($Keyword + '{ENTER}')
            Write-Output "NAVIGATED"
        }
        "focus_browser" {
            $activated = $false
            try {
                $targetHwnd = [IntPtr]::Zero

                # 1. Search for a process where MainWindowTitle matches $Keyword or YouTube
                if ($Keyword) {
                    $named = Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle -match $Keyword } | Select-Object -First 1
                    if ($named) {
                        $targetHwnd = $named.MainWindowHandle
                    }
                }
                if ($targetHwnd -eq [IntPtr]::Zero) {
                    $yt = Get-Process | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.MainWindowTitle -match "YouTube" } | Select-Object -First 1
                    if ($yt) {
                        $targetHwnd = $yt.MainWindowHandle
                    }
                }

                # 2. If title not matched yet, search by browser process name
                if ($targetHwnd -eq [IntPtr]::Zero) {
                    $browserNames = @('chrome', 'msedge', 'opera', 'brave', 'firefox')
                    foreach ($name in $browserNames) {
                        $p = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
                        if ($p) {
                            $targetHwnd = $p.MainWindowHandle
                            break
                        }
                    }
                }

                # 3. Bring to front with dual-layer (TopMost flash + AttachThreadInput + WScript.Shell)
                if ($targetHwnd -ne [IntPtr]::Zero) {
                    $activated = [DesktopController]::BringToFront($targetHwnd)
                    try {
                        $ws = New-Object -ComObject WScript.Shell
                        $ws.AppActivate([int]$targetHwnd)
                    } catch {}
                }
            } catch {
                # Fallback silently on error
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

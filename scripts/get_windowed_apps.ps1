Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public class WindowedAppHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenWindowStation(string lpszWinSta, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessWindowStation(IntPtr hWinSta);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern bool IsZoomed(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("dwmapi.dll")]
    public static extern int DwmGetWindowAttribute(IntPtr hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);

    public const int DWMWA_CLOAKED = 14;

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public class WindowEntry {
        public long Hwnd;
        public string Title;
        public int Left;
        public int Top;
        public int Width;
        public int Height;
        public bool IsBrowser;
        public int ZOrder;
    }

    public static List<WindowEntry> GetWindowedApps(int screenWidth, int screenHeight) {
        IntPtr hwinsta = OpenWindowStation("WinSta0", false, 0x037F);
        if (hwinsta != IntPtr.Zero) SetProcessWindowStation(hwinsta);
        IntPtr hdesk = OpenDesktop("Default", 0, false, 0x01FF);
        if (hdesk != IntPtr.Zero) SetThreadDesktop(hdesk);

        var list = new List<WindowEntry>();
        int order = 0;

        EnumDesktopWindows(hdesk, (hWnd, lParam) => {
            order++;
            if (!IsWindowVisible(hWnd) || IsIconic(hWnd) || IsZoomed(hWnd)) return true;

            int cloaked = 0;
            DwmGetWindowAttribute(hWnd, DWMWA_CLOAKED, out cloaked, sizeof(int));
            if (cloaked != 0) return true;

            RECT r;
            if (!GetWindowRect(hWnd, out r)) return true;
            int w = r.Right - r.Left;
            int h = r.Bottom - r.Top;

            // Filter out tiny windows/widgets
            if (w < 320 || h < 220) return true;

            // Filter out off-screen windows
            if (r.Left < -120 || r.Top < -80) return true;

            // Filter out maximized or near full-screen snapped windows (leaving at least some room for windowed mode)
            if (w >= (screenWidth - 30) && h >= (screenHeight - 85)) return true;

            var sb = new StringBuilder(256);
            GetWindowText(hWnd, sb, 256);
            string title = sb.ToString().Trim();
            if (string.IsNullOrEmpty(title)) return true;

            string lower = title.ToLowerInvariant();
            if (lower == "program manager" ||
                lower.Contains("overlay") ||
                lower.Contains("experiencia de entrada") ||
                lower.Contains("input experience") ||
                lower.Contains("capri") ||
                lower.Contains("cyber companion") ||
                lower.Contains("capri desktop") ||
                lower.Contains("taskbar") ||
                lower.Contains("default ime") ||
                lower.Contains("msctfime ui")) return true;

            // Check if process name or title is a browser
            uint pid = 0;
            GetWindowThreadProcessId(hWnd, out pid);
            string procName = "";
            try {
                if (pid > 0) {
                    var proc = System.Diagnostics.Process.GetProcessById((int)pid);
                    procName = proc.ProcessName.ToLowerInvariant();
                }
            } catch {}

            bool isBrowser = lower.Contains("opera") ||
                             lower.Contains("chrome") ||
                             lower.Contains("edge") ||
                             lower.Contains("brave") ||
                             lower.Contains("firefox");

            list.Add(new WindowEntry {
                Hwnd = (long)hWnd,
                Title = title,
                Left = r.Left,
                Top = r.Top,
                Width = w,
                Height = h,
                IsBrowser = isBrowser,
                ZOrder = order
            });

            return true;
        }, IntPtr.Zero);

        return list;
    }
}
"@

try {
    Add-Type -AssemblyName System.Windows.Forms
    $screen = [System.Windows.Forms.Screen]::PrimaryScreen
    $sw = $screen.Bounds.Width
    $sh = $screen.Bounds.Height
} catch {
    $sw = 1920
    $sh = 1080
}

$apps = [WindowedAppHelper]::GetWindowedApps($sw, $sh)
# Sort browsers first, then by Z-order
$sorted = $apps | Sort-Object { if ($_.IsBrowser) { 0 } else { 1 } }, ZOrder

$json = $sorted | ConvertTo-Json -Compress
if ($null -eq $json -or $json -eq "") {
    Write-Output "[]"
} else {
    # If single object, format as array
    if (-not $json.StartsWith("[")) {
        $json = "[$json]"
    }
    Write-Output $json
}

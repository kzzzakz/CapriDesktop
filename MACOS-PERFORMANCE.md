# macOS background window checks

Perching queries only the target app's windows instead of inspecting every application's Accessibility tree. The 500 ms follow interval is unchanged. Concurrent foreground, window-list and per-app queries share in-flight reads and short-lived completed snapshots; failed helper requests back off instead of repeatedly spawning work.

Window polling pauses on lock/suspend and resumes with fresh snapshots. Tracking and roaming skip work while paused; hidden companions skip perch tracking. Transient query failures no longer leave tracking stuck or discard the perch immediately. Windows/Linux keep their platform routes.

## Validation (2026-11-08)

Four focused tests cover overlapping/slow reads, cache expiry, failure backoff, invalidated pre-sleep results, targeted queries, and lock/suspend/resume behavior. Existing tests, TypeScript checks, Swift helper compilation and production arm64 build pass. Installed app reopens; application and helper signing requirements/version are unchanged, and helper Accessibility access remains granted.

A local eight-run helper benchmark measured:

| Check | Mean elapsed | Mean helper-process CPU |
| --- | ---: | ---: |
| Previous full window enumeration (7 windows) | 424.00 ms | 24.92 ms |
| Target-app query (1 window) | 57.79 ms | 8.04 ms |

These are helper-query measurements under the current desktop workload, not total-app CPU, RAM or battery benchmarks. Live perching movement and physical sleep/wake still need user testing; power transitions were exercised with synthetic events in automated tests. Windows/Linux runtime was not tested.

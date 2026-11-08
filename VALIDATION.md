# macOS validation — upstream 1.0.4 / Mac revision 15

Apple Silicon personal build. See [UPSTREAM-MAC-REVIEW.md](UPSTREAM-MAC-REVIEW.md) for release-by-release integration details.

## Passing checks

- 62 regression tests covering platform/updater routing, cloud vision/provider separation, credential-safe request metadata, Spotify selection/errors, placement/crop math, voice wake gating, microphone cleanup, screen-comment consent/lock gating, Mac command bounds, hotkeys, multilingual fixed requests and speech-cache relocation planning.
- TypeScript main/preload/renderer checks; Python voice-script syntax; Swift native helper build; production Electron arm64 package and signature verification.
- Packaged read-only native queries for battery, disk space, OS version, local clock and system volume.
- Offline synthetic speech transcription with a previously downloaded Whisper base model. Missing-model state in a fresh profile returns setup instructions; no model silently downloaded.
- Prior user acceptance on this Mac: cloud chat/vision, Spotify desktop control, login startup, permissions and local voice/wake behavior. Those accepted features are preserved by the merge; this is not a claim of fresh testing every path after each change.

## Not yet fully validated

- Real external-disk relocation, low-disk/interrupted migration and rollback on physical hardware; tests use isolated dry-run paths.
- Hardware-dependent volume/mute writes (bounded/verified in tests), every external audio device/microphone and every System Settings destination.
- All ten spoken languages, physical Retina/external displays, fullscreen Spaces and keyboard combinations on different layouts.
- Spotify Web API live credentials/Premium account path, all permission revocation/regrant combinations and a clean second Mac.
- Windows/Linux runtime; passing static checks do not establish runtime equivalence.
- Intel/older macOS compatibility, Developer ID signing/notarization and public Gatekeeper acceptance.

Local validation artifacts and API keys, app-data backups, user settings, models, private signing identity and built binaries are excluded from the source repository.

On Mac, storage moves leave a standalone/shared Ollama library in place. Only model folders already managed under Capri’s selected storage root are eligible to move; a running standalone server must be quit first. Speech caches and Capri’s Python environment can be relocated independently.

## Game-mode and personality fixes (Mac revision 14)

- Removed the unconditional cloud Live Scan disable; explicit confirmation, session-only cloud state, one-minute upload limit, stop-on-close/lock/error/settings-change, and suppression of late results are covered by the scanner service test with synthetic captures and a mocked provider.
- Added foreground game recognition/context with expiry and browser false-positive checks, plus independent persisted game-comment intervals. Game-only schedules do not capture other applications in tests.
- Mac companion/scanner use Electron panel windows. Removed the Windows-only topmost keepalive on Mac; returning from main settings preserves the game overlay. The Mac companion uses a native context menu and opens full-size shared settings.
- Compact cloud chat now retains character identity, expressive look/voice rules and recent scan memory. Cloud scanner prompts request an in-character response rather than a plain image caption. Subjective personality quality requires user acceptance.
- Actual ULTRAKILL fullscreen interaction, native menu placement during a game, live provider game commentary and real Live Scan remain pending hands-on validation. Automated tests do not establish those runtime results.

Installed revision 14 verification: the existing `/Applications/Capri Desktop.app` was updated in place with an unchanged designated signing requirement. Existing top-level JSON settings hashes matched before and immediately after the update. The installed app passed all 15 isolated-profile smoke checks with no renderer errors; the screen-capture check was deliberately skipped, and the missing-dependency check noted that Python is present. The DMG checksum verified with `hdiutil`.

Visible UI checks on the installed app confirmed the native right-click menu in desktop and game mode, full-size voice settings opened from that menu, the new game interval alongside the preserved 8-minute desktop interval, and the game overlay surviving a trip through Mac settings. The app was returned to desktop mode. No real screen images were sent to a provider during these checks.

## Game commentary cadence (Mac revision 15)

The installed foreground helper reported `process: Roblox` and `/Applications/Roblox.app`, while the previous detector accepted only the Windows `RobloxPlayerBeta` name. Native Roblox is now recognized without misidentifying browser pages or Roblox Studio. Live preference inspection confirmed desktop comments at 8 minutes and game comments at 1 minute; these preferences were not changed.

Replaced the mode-switch-reset countdown with elapsed time since the last attempt. Regression tests verify that a one-minute game interval overrides the initial eight-minute desktop delay and that brief foreground changes do not indefinitely postpone commentary. Ordinary visible gameplay is now explicitly eligible for a short reaction, with privacy and no-invented-events rules retained. Live gameplay speech cadence still needs user acceptance after installing this revision.

Mac game appearance is now resolved after transient script/AI/voice states, so a pending cloud reply cannot replace the framed eyes with the full-body thinking sprite. A platform-routing regression covers thinking, speech, script looks and explicit mode exit, preserving Windows/Linux behavior. Foreground game detection does not automatically turn off manually enabled Mac game mode.

Revision 15 was installed in place and reopened. The signing requirement remained unchanged, and the existing 8-minute desktop / 1-minute game preferences were preserved. A subsequent automatic vision request returned HTTP 200 while the native foreground helper identified Roblox; this confirms a live provider cycle, not subjective acceptance of every spoken comment. The new arm64 DMG checksum verified successfully. The game-form lock is covered by the appearance regression; a full gameplay question-and-answer retest remains for the user.

## Manual game mode across applications

Game-mode comment cadence now follows the explicit mode switch, independently of foreground game detection. The mode persists in Mac feature settings and is restored after roaming initialization. Settings includes a mode checkbox, and voice confirmation no longer says closing a game will disable it. Zero disables automatic comments for that mode; desktop cadence resumes when the switch is off. Mode changes abort pending comment requests and suppress late results.

62 regression tests pass, covering comments without a detected game, game detection without mode enabled, app switching, desktop interval restoration, explicit zero, partial settings persistence, and stale-response cancellation. Private/locked screens and busy/permission guards remain in place. Synthetic capture/provider tests do not establish the subjective quality of comments on every application.

Installed-app manual check: enabled the new checkbox while in the shared Settings page, returned to the companion and observed the cyber-frame, quit Capri and confirmed its process exited, then reopened the installed app and observed the restored cyber-frame. The saved mode was true and the prior desktop/game intervals remained 8/1 minutes. The checkbox was left enabled for user testing. Version and designated signing requirement were unchanged. This verifies manual mode/persistence; cross-app commentary cadence is additionally covered by synthetic-provider regression tests.

## Screen-comment cadence and diagnostics

Replaced avatar-pose gating with actual agent/script/scanner activity. The next check is measured from scan start, independent of provider reply latency, with one-second due/activity resolution and cached settings. Transient failures preserve configured intervals; repeated failures use visible backoff, never faster than the selected interval. Read-only timer metadata is available in Settings and in the app-data `screen-comment-status.json`; it contains no images, prompts, responses or credentials.

New regression tests cover a stale curious pose, a 20-second reply without deadline drift, actual task/script pauses and prompt resumption, transient error/retry persistence, and explicit Mac mode-command parsing. Questions, negations and complaints no longer toggle the mode. Mac placement preserves game mode, and proactive-dialogue auto-healing cannot disable manual Mac mode.

AgentManager also releases its busy latch when a prompt promise completes or fails without a session-finished event, while preserving a concurrent editor task. Two direct AgentManager lifecycle regressions cover those paths. Total: 62 tests. A due check resumes after actual task/script activity ends without starting another full interval.

Installed-app live cadence verification: observed two automatic screen captures 60.188 seconds apart with game mode active and a one-minute interval. The first posted a comment; the second was recorded as a duplicate and was not spoken again. This verifies scan cadence independently of audible-comment frequency. The old profile had both comment intervals set to zero; the requested one-minute game interval was restored through Settings.


### Casual app request understanding — 2026-11-08

- Type checks and production/arm64 app-directory build pass; 65 automated tests pass (62 platform/feature, 1 scanner, 2 agent lifecycle).
- Added coverage for conversational fillers, coordinated app lists, aliases, duplicate names, ordinary questions/search/music requests, actual failures and cancellation between launches.
- Installed in place at `/Applications/Capri Desktop.app`; both signatures verified, designated signing requirement unchanged, version remains `1.0.4-mac.15`.
- Live Dev Deck tests: “open firefox for me choom” opened Firefox; “heya lwk lets go with discord and firefox and chatgpt” opened all three apps with separate successful tool results and confirmations.
- Voice transcription itself was not retested; recognized voice text uses the same request route. Windows/Linux runtime remains untested. No new DMG or release was created for this patch.


### Conversational commands and action personality — 2026-11-08

- Type checks, production build and signed arm64 app-directory build pass. All 68 tests pass, including command wrappers, ordinary questions, mixed-action rejection, launch/quit intent and truthful varied replies.
- Updated the installed app in place with the same version and designated signing requirement; signature verification passes.
- Live test: “heya choom could u please open Firefox for me” opened Firefox and replied “Done, choom—Firefox's open. What are we browsing?”
- Multiple-app quit was tested with pure parsing/outcome tests, without closing the user's working apps. Voice transcription and Windows/Linux runtime were not retested. No DMG/release or PR push was performed.


### Native app and directory commands — 2026-11-08

- All 71 tests pass; full type checks, production build and signed arm64 app-directory build pass.
- Added command parsing tests for quoted arguments, listing flags, malformed input and rejected shell syntax; real temporary-directory tests cover hidden filenames, spaces, relative/home paths and missing-path failures without browser fallback.
- Installed Mac app names extend natural-language matching, while ordinary chat avoids rescanning application directories.
- Live installed-app checks: `ls /Applications` returned the actual local app listing; `open -a "Firefox"` completed the native launch tool and confirmed success in Capri's voice. No web search was used.
- Updated in place with the same version/signing requirement; signature verification passes. Windows/Linux runtime and voice transcription not retested. No new DMG/release or PR push.


### App spelling tolerance — 2026-11-08

- All 72 tests pass; full type checks, production and arm64 app-directory builds pass.
- Focused tests cover missing/swapped letters, explicit command typos, installed-name priority, ambiguous choices with no partial execution, unrelated words and unchanged file paths.
- Live installed-app test: `opne firfox and discrod for me choom` launched Firefox and Discord through separate successful native tool calls and returned a combined Capri confirmation.
- Updated in place with unchanged version/designated signing requirement. Voice transcription and Windows/Linux runtime not retested; no PR push or new DMG/release.

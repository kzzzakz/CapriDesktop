# scripts-capri

Patch scripts Capri reads out loud after updating herself. One file per version and language:

```
scripts-capri/
  0.2.0.es.txt
  0.2.0.en.txt
```

- **Name:** `<version>.<lang>.txt`, with the same version as `package.json` (`es` or `en`). A plain `<version>.txt` works for any language.
- **When she reads them:** on the first launch of a newer version, Capri reads the script of every version she skipped, oldest first (from 0.1.0 to 0.4.0 she reads 0.2.0, 0.3.0 and 0.4.0). A fresh install reads nothing.
- **On demand:** "¿qué hay de nuevo?" / "what's new?" reads the script of the version that's running.
- **How to write them:** in Capri's voice, comparing before and now ("antes tenías que..., ahora..."). Emotion tags like `[excited]`, `[happy]`, `[giggles]`, `[laugh]`, `[playful]` are acted out by Fish Audio; other voices skip them. Use `{name}` for the user's name. Keep it to about 4 to 6 sentences.

## Publishing a version

1. Write `scripts-capri/<version>.es.txt` and `.en.txt`.
2. Bump `"version"` in `package.json` to that same version.
3. `npm run dist:win`, and `npm run dist:linux` on Linux.
4. On GitHub, create a Release with the tag `v<version>` and upload `release/CapriDesktop-Setup-<version>.exe`, `release/CapriDesktop-<version>.deb` and `release/CapriDesktop-<version>.tar.gz`.

When someone says "Capri, actualizate", she checks the latest Release. If it's newer than hers, she downloads the file for her system, installs it and comes back on the new version, reading the scripts. A `.deb` asks for the password first.

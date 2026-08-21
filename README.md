<p align="center">
  <img src="build/marca/icono-512.png" width="120" alt="Escriba">
</p>

<h1 align="center">Escriba</h1>

<p align="center">
  Record your meetings, transcribe them on your own Mac, and turn what was said
  into a minute with agreements and open items.<br>
  <a href="README.es.md">Léeme en español</a>
</p>

---

## What makes it different

Plenty of tools transcribe a meeting. Escriba reads **the client's own file**
before writing, so the minute knows what was pending from last time.

That is why, besides the minute you send the client, it produces a set of
**internal notes you never send**: what was *not* said, what was postponed
again, and which openings came up.

- **Records both sides.** Your microphone and the Mac's own audio, so it works
  for in-person meetings and for video calls alike.
- **Knows who said what.** The two audio tracks are recorded separately, so the
  minute can tell your commitments apart from the client's — no diarization
  model required.
- **Everything stays local.** Audio never leaves the machine. Transcription runs
  on your Mac with whisper.cpp.
- **Your choice of writer.** Claude Code, your own API key, or a local model
  through Ollama.
- **Branded PDF**, ready to send.

## Requirements

- macOS 13 or newer, Apple Silicon
- [Homebrew](https://brew.sh) for `ffmpeg` and `whisper-cpp`
- A writing engine: Claude Code, an API key, or Ollama

The app checks all of this on first launch and installs what is missing.

## Install

Download the `.dmg` from [Releases](https://github.com/kapitecsoluciones/escriba/releases)
and drag Escriba to Applications.

The app is **not notarized**, so the first time macOS will refuse to open it:
right-click the app and choose *Open*, then confirm. You only do this once.

## Build from source

```bash
git clone https://github.com/kapitecsoluciones/escriba.git
cd escriba
pnpm install
pnpm run nativo   # compiles the Swift audio capture helper
pnpm start
```

`pnpm run dist` produces the `.dmg`.

## Privacy, and one thing you should know

Escriba records conversations. **Telling the other people in the room that you
are recording is your responsibility**, and in many places it is a legal
requirement. The app will not do it for you.

Where your data goes depends on the engine you pick, and the app states it in
plain language on the settings screen:

| Engine | What leaves your Mac |
|---|---|
| Claude Code | The meeting text, to Anthropic |
| Your API key | The meeting text, to your chosen provider |
| Ollama | Nothing |

Audio never leaves the machine with any of them. If you point Escriba at a
folder of client files, the relevant file's content is included in the prompt —
so pick your engine accordingly.

## Why ffmpeg is not bundled

ffmpeg is GPL-licensed. Shipping it inside an MIT-licensed app would force the
whole app to become GPL, so Escriba installs it through Homebrew instead.
whisper.cpp is MIT, so that one does ship with the app.

## License

MIT © Kapitec Soluciones

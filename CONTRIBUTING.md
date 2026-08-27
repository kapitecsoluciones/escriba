# Contributing

Thanks for taking a look.

## Getting set up

```bash
pnpm install
pnpm run nativo   # compiles nativo/CapturaSistema.swift
pnpm start
```

You need Xcode Command Line Tools for the Swift helper — the full Xcode is not
required.

## Ground rules

- **No client data, ever.** This project grew out of real consulting work. CI
  fails the build if a private term shows up in the tree. Do not commit names,
  logos, transcripts or meeting files.
- **Spanish is the interface language**; code, comments and docs are in English
  except `README.es.md`.
- Keep it dependency-light. The whole app runs on Electron plus the system's own
  tools; think twice before adding a package.

## What would help most

- Windows and Linux support for the audio capture helper (today it is macOS-only,
  built on ScreenCaptureKit).
- More writing engines.
- Making the minute template configurable without editing `lib/prompt.js`.

## Adding a writing engine

Writing engines live in `lib/motores/`. Each module exposes `id`, `nombre`,
`descripcion`, `privacidad`, `disponible()`, `probar()` and `redactar(prompt,
{ senal })`. Register a new engine in `lib/motores/index.js`; add it to the
automatic order only when falling through to it is safe and expected.

CLI engines must receive the meeting through stdin, honor the supplied
`AbortSignal`, avoid loading user or project instructions, and run without
tools or filesystem access beyond the credentials strictly needed to
authenticate. Add focused tests for availability, authentication, cleanup,
cancellation and fallback before opening a pull request.

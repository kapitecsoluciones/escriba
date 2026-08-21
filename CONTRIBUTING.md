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

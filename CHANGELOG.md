# Changelog

## 0.4.0 — 2026-08-20

Usability pass, plus the first automated tests. The 0.3.0 release stopped the
app from losing meetings; this one stops it from wasting your patience.

**A bug that could freeze the app forever**

- The Markdown converter had a reproducible infinite loop. A heading with five
  hashes, a `#` with no space after it, or a table the writing engine cut off
  mid-row would spin the CPU and never return. Exporting a PDF from such a
  minute froze the app with no error. The renderer carried a second copy of the
  same converter with the same defect, which froze the window itself; it is now
  gone and both share `lib/md.js`.

**You can see what is happening, and stop it**

- Transcribing an hour takes about ten minutes. whisper reports its own
  percentage on stderr and the app was throwing it away, showing a frozen
  message instead. There is now a real progress bar. Verified against a
  1 h 32 min recording.
- **Cancel**. It kills whisper, ffmpeg and the writing engine — previously
  there was no way to stop a process short of force-quitting the app.
- Starting a second meeting while one is still processing is no longer
  possible; three of the four entry points allowed it.

**You can undo things**

- The button that saved an edit was labelled **Ver**. It is now **Guardar
  cambios**, with **Descartar** beside it, and ⌘S works.
- Leaving a half-edited minute — by switching client, opening another meeting,
  or clicking a search result — silently discarded the changes. It now asks.
- **Volver a redactar** overwrote hand-corrected minutes with no confirmation
  and no way back. It now confirms, and every overwrite keeps the previous
  version, restorable from the menu.
- **Borrar esta reunión**, which did not exist. It moves the folder to the
  Trash rather than deleting it, refuses any path outside the meetings folder,
  and removes the now-dangling reference from the client's dossier.

**Less noise**

- Up to six same-weight buttons were shown at once. There is now one primary
  action and a **Más** menu for the rest.
- Folder settings are typed no more: they use the native picker.
- A failed install or download left its button dead and disabled, with no way
  to retry short of closing Settings. It now says why and offers a retry.
- The window remembers its size and position.
- Settings close with Escape or a click outside, focus the first field, and
  open with ⌘,.
- First run showed a bare form. It now says what the app is for.
- Secondary text was at 3.1:1 contrast, below the 4.5:1 minimum. Now 4.6:1 or
  better on every background it is used on.
- Terms like "engine", the raw binary names and "Keychain" are gone from the
  interface.
- An empty client list was a blank rectangle; searching, an empty result, and
  the keyboard shortcut are now discoverable.

**Tests, for the first time**

- 67 tests over `lib/`, using `node:test` — no new dependencies. They cover the
  converter's hang cases, speaker attribution's 2 dB margin, config merging,
  the exact heading the internal-notes filter depends on, PDF escaping, the
  dossier bookkeeping, and the path guard that stands between "delete a
  meeting" and "trash an arbitrary folder".
- Three pieces of logic moved out of `main.js` so they could be tested at all:
  the dossier read/write (`lib/dossier.js`), the delete path guard
  (`rutas.dentroDeBase`), and the speaker decision (`voces.decidir`).
- Every group was verified by breaking the code on purpose and confirming the
  tests go red — including the naive `startsWith` path guard, which lets
  `~/ReunionesViejas` pass as if it were inside `~/Reuniones`. The hang cases
  run in a child process, so a regression fails in seconds instead of hanging
  CI forever.
- CI gained a test job and two checks on the Swift helper.
- The Swift job had been failing since it was created: `macos-14` runners carry
  an SDK without `SCStreamConfiguration.captureMicrophone`, which the capture
  helper needs. Moved to `macos-15`.

**Correction**

- The 0.3.0 notes listed a **Copiar Markdown** button. It was never
  implemented. It ships now, as **Copiar la minuta**, in the Más menu.

## 0.3.0 — 2026-08-20

Robustness pass. Everything here came out of auditing the code for what happens
when things go wrong, not from a feature wish list.

**It can no longer lose your meeting**

- Audio write failures were swallowed by `try?`. Worse, the sample counter went
  up anyway, so the capture helper would report success with nothing on disk.
  Now failures are reported and the counter tells the truth.
- Recording refuses to start with less than 300 MB free, and warns below 2 GB.
  An hour of meeting is about 130 MB.
- Quitting the app mid-recording used to kill the helper without letting it
  close the `.m4a` container, leaving an unplayable file. It now waits.
- The app said "Recording" the moment the process spawned. If the Screen
  Recording permission was missing you would find out after the meeting. It now
  waits for the helper to confirm it actually started.
- Only one instance can run at a time.

**It no longer wastes your time**

- Retrying after a failed draft reuses the existing transcript instead of
  running whisper again — measured 111 s down to 41 s.
- New **Volver a redactar** button: regenerate the minute, optionally with a
  different engine, without transcribing again.
- **Copiar Markdown** copies the client-facing minute to the clipboard.

**Fixes**

- The prompt now goes to the writing engine through stdin. As a command-line
  argument, a long meeting could exceed the system limit and fail after the
  transcription had already been paid for.
- Every IPC handler returns an error instead of throwing, so a failure no longer
  leaves a spinner running forever.
- Values interpolated into the PDF template are escaped.
- Errors show inside the interface instead of a native `alert()`.

## 0.2.0 — 2026-08-20

First public release.

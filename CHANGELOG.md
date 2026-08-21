# Changelog

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

<p align="center">
  <img src="build/marca/icono-512.png" width="112" alt="Escriba">
</p>

<h1 align="center">Escriba</h1>

<p align="center">
  <b>The meeting assistant that tells you what was <i>never</i> said.</b><br>
  Records both sides, transcribes on your Mac, and checks the conversation
  against the client's open items — not just what happened, but what didn't.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-black" alt="MIT">
  <img src="https://img.shields.io/badge/macOS-13%2B-black" alt="macOS 13+">
  <img src="https://img.shields.io/badge/Apple%20Silicon-arm64-black" alt="arm64">
  <img src="https://img.shields.io/github/v/release/kapitecsoluciones/escriba?color=black" alt="release">
  <a href="README.es.md"><img src="https://img.shields.io/badge/léeme-en%20español-B58A3E" alt="Español"></a>
</p>

<p align="center">
  <img src="docs/captura-minuta.png" width="860" alt="Escriba showing a finished minute">
</p>

---

## What was never said

Every notetaker summarizes what happened. Escriba also reports **what should
have happened and didn't** — checked against the client's own file:

> **The budget was never mentioned.** Fifty minutes discussing scope and nobody
> asked the price. Most urgent open item.
>
> **The email addresses are still pending from the previous meeting.** Two weeks,
> and the daily summary is still off for want of three addresses.

That section is marked *internal* and is stripped from the PDF you send. As far
as I can tell, no other tool — commercial or open source — does this. Several
read prior context; none flag the absences.

If you already keep a folder with one Markdown file per client, Escriba loads
the relevant one before writing. That is the whole setup.

## And a couple of engineering notes

### Speaker attribution without a diarization model

Escriba records **two separate tracks** — your microphone and the Mac's system
audio. To label a line, it compares the RMS energy of both tracks over that
segment and picks the louder one, with a 2 dB margin so overlapping speech
inherits the previous speaker.

That is the whole trick. No pyannote, no cloud service, no extra model —
about 80 lines in [`lib/voces.js`](lib/voces.js). It only works because the
two sides were never mixed in the first place, which is also why it is exact
for video calls and useless for a single-microphone room recording. Honest
trade-off, stated up front.

```
[00:00] You:    So the free-shipping threshold is still at 800.
[00:09] Client: Right. I'll send you the addresses on Monday.
```

### Capturing system audio without a driver

A 98 KB Swift helper built on ScreenCaptureKit, compiled with `swiftc` — **no
Xcode needed**, the Command Line Tools SDK is enough. It writes the microphone
and the system output to two AAC files at once, already in sync.

Electron's own `getDisplayMedia({audio:'loopback'})` looks like it works —
`getAudioTracks()` returns a track and `MediaRecorder` starts without error —
but the resulting file has no audio stream at all. That dead end is why the
helper exists.

## Compared to the alternatives

|  | Escriba | Granola / Fireflies | MacWhisper / Superwhisper |
|---|---|---|---|
| Audio leaves your Mac | never | yes | never |
| Works on video calls | yes | yes | needs a virtual driver |
| Knows who said what | yes, from two tracks | yes, cloud diarization | no |
| Uses your client history | yes | partly | no |
| **Flags what was _not_ said** | **yes** | **no** | **no** |
| Spanish | first-class | translated | transcription only |
| Price | free, MIT | $10–29 / user / month | one-off purchase |

What they do better: polished onboarding, calendar integrations, mobile apps,
teams and sharing. Escriba has none of that.

**Who it is for:** independent consultants and small firms — lawyers,
accountants, agencies — who already keep a folder per client, work in Spanish,
and would rather their audio never reached a server in another country.

## Install

Download the `.dmg` from [Releases](https://github.com/kapitecsoluciones/escriba/releases)
and drag it to Applications.

The app is **not notarized**, so the first launch needs right-click → *Open*.
Once.

**Requirements:** macOS 13+, Apple Silicon, [Homebrew](https://brew.sh) for
`ffmpeg` and `whisper-cpp`. The app checks all of it on first run and installs
what is missing.

## In-person meetings

Escriba was built for video calls: your microphone is you, the Mac's audio is
the other side. That is what makes speaker attribution possible without a
diarization model.

**In person there is only one track with voices, so speakers are not
separated** — and Escriba says so rather than guessing. It tells the writing
engine not to invent attributions either, because a commitment with no owner is
better than a commitment with the wrong owner in a document you send to a
client.

You can pick which microphone records. With an iPhone nearby and Continuity
enabled, its microphone shows up in the list — useful across a table, where a
laptop microphone struggles.

## While it works

Transcription takes about a minute per ten minutes of meeting, and the app
shows the real percentage while it runs — whisper reports it and Escriba reads
it rather than showing a frozen message. **Cancel** stops whisper, ffmpeg and
the writing engine, not just the spinner.

Commitments are lifted out of the minute into a checklist you can tick and copy,
and what was *never said* is summarised at the top instead of buried at the
bottom. Clicking a timestamp in the transcript plays that moment, so you can
check a quote before sending the PDF.

Nothing you type is lost: saving keeps the previous version, re-drafting keeps
the previous version, and leaving a half-edited minute asks first. Deleting a
meeting moves it to the Trash and never touches anything outside the meetings
folder.

## Tests

```bash
npm test        # node --test "test/*.test.js"
```

67 tests over `lib/`, no dependencies beyond Node itself. They cover the
Markdown converter's three former hang cases, the 2 dB margin that decides who
said what, config merging, the exact heading the internal-notes filter depends
on, and PDF escaping. Each was checked by breaking the code on purpose — a
suite that cannot fail is not a suite.

## Build from source

```bash
git clone https://github.com/kapitecsoluciones/escriba.git
cd escriba && pnpm install
pnpm run nativo   # compiles the Swift capture helper
pnpm start
```

`pnpm run dist` produces the `.dmg`. **Zero production dependencies** — the
whole app runs on Electron plus what macOS already ships.

## Who writes the minute

Your choice, and the app states in plain words what leaves the machine:

| Engine | What leaves your Mac |
|---|---|
| Claude Code | The meeting text, to Anthropic |
| Your own API key | The meeting text, to your provider |
| Ollama | Nothing |

Audio never leaves, with any of them. Keys live in the macOS Keychain.

## One thing you should know

Escriba records conversations. **Telling the other people that you are
recording is your responsibility**, and in many places it is a legal
requirement. The app will not do it for you.

## License

MIT © [Kapitec Soluciones](https://kapitec.pro) · [escriba.kapitec.pro](https://escriba.kapitec.pro)

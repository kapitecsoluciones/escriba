# Security

## Reporting

Found something? Write to info@kapitec.pro. Please do not open a public issue
for a vulnerability.

## What this app touches

Escriba records audio, writes to a folder you choose, and — depending on the
engine — sends the meeting text to a third-party API. It reads client files only
from the folder you configure.

API keys are stored in the macOS Keychain (`security add-generic-password`),
never in a file inside the project.

The app is not notarized. It runs unsigned on your machine by design; if you
distribute a build, sign it yourself.

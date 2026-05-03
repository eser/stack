# noskills-server quickstart

## Install

```bash
brew install eserstack/tap/noskills-server
```

Or download a binary from https://github.com/eser/stack/releases and add it to your PATH.

## Start the daemon

```bash
noskills-server start
```

First run: prints a PIN and a URL. Open the URL in your browser, log in with the PIN.

## Health check

```bash
noskills-server doctor
```

Checks: port availability, Node.js version, cert validity, ledger dir permissions.

## Attach a project

```bash
noskills-server start &
# Then open https://localhost:4433 and register a project path
```

Or use the CLI (after `brew install eserstack/tap/noskills`):

```bash
noskills add-project --path /path/to/your/project
noskills attach my-project
```

## Manage the PIN

```bash
noskills-server pin      # reset + reprint
```

## Run as a background service

```bash
brew services start noskills-server   # macOS launchd
# or
noskills-server install-service       # installs launchd plist / systemd unit
```

## File a bug or DX issue

```bash
noskills-server feedback   # opens a pre-filled GitHub issue URL
```

## More

- Source: https://github.com/eser/stack
- ADRs: https://github.com/eser/stack/tree/main/docs/adr
- Contributing: https://github.com/eser/stack/blob/main/CONTRIBUTING.md

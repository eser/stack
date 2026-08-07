# noskills-server quickstart

## Install

```bash
brew install eser/tap/noskills-server
```

Or install with the one-liner:

```bash
curl -fsSL https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.sh | sh -s noskills-server
```

Or download a binary from https://github.com/eser/stack/releases and add it to
your PATH.

## Start the daemon

```bash
noskills-server start
```

First run: prints a PIN and a URL. Open the URL in your browser, log in with the
PIN.

## Health check

```bash
noskills-server doctor
```

Checks: port availability, agent CLI, JS runtime for mux sessions, cert
validity, ledger dir permissions.

## Attach a project

```bash
noskills-server start &
# Then open https://localhost:4433 and register a project path
```

Or use the CLI (after `brew install eser/tap/noskills`):

```bash
noskills session          # manage sessions for multi-instance support
noskills manager          # multi-spec TUI with tab management
```

## Manage the PIN

```bash
noskills-server pin      # reset + reprint
```

## Run as a background service

```bash
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

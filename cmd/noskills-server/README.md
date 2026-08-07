# noskills-server

Persistent Claude Code sessions that survive reboots. Attach from any device —
laptop, phone, second terminal — and resume exactly where you left off.

<!-- asciinema recording: run `agg assets/asciinema/quickstart.cast assets/asciinema/quickstart.gif` to regenerate -->
<!-- TODO: record and embed 60-second quickstart.cast once v1 ships -->

## Install

**macOS / Linux (one-liner):**

```sh
curl -fsSL https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.sh | sh -s noskills-server
```

One installer serves the whole family; the product is the argument. `eser`,
`noskills` and `laroux` install the same way.

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/eser/stack/main/etc/scripts/install.ps1 | iex
# or a specific product:
#   .\install.ps1 -Product noskills-server
```

**Homebrew:**

```sh
brew install eser/tap/noskills-server
```

**Auto-start on login:**

```sh
noskills-server install-service
```

## Quick start

```sh
# Start the daemon (generates a PIN on first run)
noskills-server start

# Verify everything is working
noskills-server doctor

# Manage sessions (the daemon stores no per-session state of its own)
noskills session

# Reset your PIN (invalidates all tokens)
noskills-server pin
```

## Why this exists

Every other Claude tool restarts when you close it. This one doesn't.

| Tool                | Persistent sessions | Multi-device | TTHW    |
| ------------------- | ------------------- | ------------ | ------- |
| Claude CLI          | No                  | No           | ~30s    |
| Aider               | No                  | No           | ~2m     |
| Clay                | No (local only)     | No           | ~5m     |
| **noskills-server** | **Yes**             | **Yes**      | **<2m** |

The magical moment: close your laptop, reopen it tomorrow, attach, and the
session replay shows every message from yesterday before live mode resumes.

## How it works

```
Browser / CLI / TUI
       │
       │  HTTP/3 + WebTransport (port 4433)
       ▼
noskills-server (Go daemon)
  ├── Session manager + JSONL ledger
  ├── Multi-client fan-out broadcaster
  ├── Auth (PIN + Bearer token)
  └── Worker manager
             │
             ├── agent sessions: in-process ACP worker
             │     acpfx.InProcess over net.Pipe -> acpfx/shim
             │     -> claude --print --output-format stream-json
             │     cwd = your project root
             │
             └── mux sessions: TS worker over a Unix socket (JSONL)
                   mux-worker.ts under Deno
```

Agent sessions carry no subprocess of their own: the ACP shim is Go code linked
into this daemon, reached by a function call rather than a pipe. It still drives
a vendor CLI (`claude`, `kiro` or `opencode`), which must be installed.
`NOSKILLS_ACP_COMMAND` points at a genuinely external ACP agent instead
(`gemini --acp`, `claude-agent-acp`).

Only mux sessions still spawn a TypeScript worker, because a terminal pane's
content channel is VT bytes rather than protocol messages.

Sessions persist across daemon restarts via an append-only JSONL ledger
(`~/.noskills/sessions/`). On reattach the client receives a full transcript
replay before entering live mode.

## Commands

| Command                      | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `noskills-server start`      | Start the daemon                                  |
| `noskills-server doctor`     | Run health checks (mkcert, port, agent CLI, cert) |
| `noskills-server pin`        | Reprint or reset the auth PIN                     |
| `noskills-server version`    | Print version, commit, build date, platform       |
| `noskills-server feedback`   | Open a pre-filled GitHub issue                    |
| `noskills-server quickstart` | Print this guide offline                          |

## Start flags

| Flag            | Default       | Description                               |
| --------------- | ------------- | ----------------------------------------- |
| `--listen`      | `:4433`       | UDP address to listen on                  |
| `--data-dir`    | `~/.noskills` | Daemon state directory                    |
| `--self-signed` | `true`        | Generate a self-signed TLS cert           |
| `--cert`        | —             | PEM cert file (overrides `--self-signed`) |
| `--key`         | —             | PEM key file                              |
| `--log-level`   | `INFO`        | `DEBUG`, `INFO`, `WARN`, `ERROR`          |
| `--log-format`  | `text`        | `text` or `json`                          |

## Storage layout

```
~/.noskills/
├── daemon.json          # registered projects
├── auth.json            # PIN hash + active tokens
├── tls/                 # TLS cert + fingerprint
├── sessions/            # append-only JSONL ledgers
├── push/                # Web Push subscriptions + VAPID keypair
├── runtime/             # ephemeral Unix sockets (0700)
└── telemetry.json       # anonymous telemetry consent (opt-in)
```

## Certificate trust

By default, `noskills-server` generates a self-signed ECDSA-P256 cert valid for
14 days. The SHA-256 fingerprint is printed on startup and available at
`GET /api/cert-fingerprint` (unauthenticated).

- **CLI**: `noskills` pins the fingerprint automatically.
- **Browser**: use `--ignore-certificate-errors-spki-list=<fingerprint>` or the
  PWA's automatic cert-pinning flow.
- **mkcert** support (planned Phase 6): installs a local CA for zero-setup
  browser trust.

## Security

- PIN-based auth with rate limiting (5 attempts/min/IP, lockout after 10
  failures)
- Bearer token with 24-hour TTL; invalidated on `noskills-server pin`
- TLS 1.3 only
- Runtime dir permissions 0700; socket files 0600
- VAPID private key 0600

## DX scorecard

| Pass                | Score |
| ------------------- | ----- |
| Getting Started     | 10/10 |
| API / CLI / SDK     | 10/10 |
| Errors & Debugging  | 10/10 |
| Docs & Learning     | 10/10 |
| Upgrade & Migration | 8/10  |
| Dev Environment     | 10/10 |
| Community           | 7/10  |
| DX Measurement      | 6/10  |

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

Apache-2.0 — see [LICENSE](../../LICENSE).

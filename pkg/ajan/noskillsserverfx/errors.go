package noskillsserverfx

import "fmt"

// NSError is a structured daemon error with an HTTP-status-with-NS-subcode.
// Format: <http-status>.NS<two-digit> (e.g. 503.NS01).
// Each code has a Cause (what went wrong) and a Fix (one-line remediation).
type NSError struct {
	Code    string
	Message string
	Cause   string
	Fix     string
}

func (e *NSError) Error() string {
	return fmt.Sprintf("Error %s: %s", e.Code, e.Message)
}

// NSErrors is the canonical registry. Codes are stable across minor versions.
var NSErrors = struct {
	PortInUse            *NSError
	MkcertMissing        *NSError
	AuthMissing          *NSError
	AuthTokenExpired     *NSError
	AuthLocked           *NSError
	WorkerDied           *NSError
	WorkerSpawnTimeout   *NSError
	NodeMissing          *NSError
	NodeVersionTooOld    *NSError
	LedgerWriteError     *NSError
	DaemonAlreadyRunning *NSError
}{
	PortInUse: &NSError{
		Code:    "503.NS01",
		Message: "port in use",
		Cause:   "another process is already bound to the configured port",
		Fix:     "noskills-server start --listen :8443  (or: lsof -i :4433 to find what's using it)",
	},
	MkcertMissing: &NSError{
		Code:    "503.NS02",
		Message: "mkcert binary not found",
		Cause:   "mkcert is required to install a local CA for browser trust",
		Fix:     "brew install mkcert  (macOS) / apt install mkcert  (Ubuntu/Debian)",
	},
	AuthMissing: &NSError{
		Code:    "401.NS01",
		Message: "auth token missing",
		Cause:   "request has no Authorization: Bearer token or ?token= query param",
		Fix:     "run noskills-server pin to get your PIN, then POST /auth/login",
	},
	AuthTokenExpired: &NSError{
		Code:    "401.NS02",
		Message: "auth token expired",
		Cause:   "the token has passed its expiry time",
		Fix:     "re-login: POST /auth/login  (or run noskills attach which does this automatically)",
	},
	AuthLocked: &NSError{
		Code:    "429.NS01",
		Message: "auth locked — too many failed attempts",
		Cause:   "10 consecutive wrong PINs from this IP within 5 minutes",
		Fix:     "wait 5 minutes, then try again; run noskills-server pin to confirm your PIN",
	},
	WorkerDied: &NSError{
		Code:    "502.NS01",
		Message: "worker process died",
		Cause:   "the Node.js worker for this session exited unexpectedly",
		Fix:     "reattach to the session — the daemon will respawn the worker",
	},
	WorkerSpawnTimeout: &NSError{
		Code:    "502.NS02",
		Message: "worker spawn timeout",
		Cause:   "worker did not report 'ready' within 5 seconds",
		Fix:     "check that Node >= 20 is installed: node --version",
	},
	NodeMissing: &NSError{
		Code:    "503.NS03",
		Message: "Node.js not found in PATH",
		Cause:   "noskills-server workers require Node.js >= 20",
		Fix:     "install Node.js: https://nodejs.org  or  brew install node",
	},
	NodeVersionTooOld: &NSError{
		Code:    "503.NS04",
		Message: "Node.js version too old",
		Cause:   "worker requires Node.js >= 20; installed version is older",
		Fix:     "upgrade Node.js: brew upgrade node  or  nvm install 22",
	},
	LedgerWriteError: &NSError{
		Code:    "500.NS01",
		Message: "ledger write failed",
		Cause:   "could not append to the session JSONL ledger on disk",
		Fix:     "check disk space and permissions on ~/.noskills/sessions/",
	},
	DaemonAlreadyRunning: &NSError{
		Code:    "503.NS05",
		Message: "daemon already running",
		Cause:   "another noskills-server process is already using the port",
		Fix:     "noskills-server status  or  noskills-server stop",
	},
}

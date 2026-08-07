package noskillsserverfx

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

// CheckStatus represents the result of a single health check.
type CheckStatus int

const (
	CheckOK   CheckStatus = iota
	CheckWarn             // non-fatal, daemon can run
	CheckFail             // fatal, daemon cannot run
)

func (s CheckStatus) String() string {
	switch s {
	case CheckOK:
		return "ok"
	case CheckWarn:
		return "warn"
	default:
		return "fail"
	}
}

// CheckResult is the outcome of one doctor check.
type CheckResult struct {
	Name    string      `json:"name"`
	Status  CheckStatus `json:"status"`
	Message string      `json:"message"`
	Fix     string      `json:"fix,omitempty"`
}

// DoctorReport is the aggregated result of all checks.
type DoctorReport struct {
	Checks   []CheckResult `json:"checks"`
	Failures int           `json:"failures"`
	Warnings int           `json:"warnings"`
}

// RunDoctor runs all health checks and returns a DoctorReport.
func RunDoctor(cfg *ServerConfig) *DoctorReport {
	report := &DoctorReport{}

	checks := []func(*ServerConfig) CheckResult{
		checkWorkerRuntime,
		checkPortFree(cfg),
		checkLedgerDir(cfg),
		checkRuntimeDirPerms(cfg),
		checkCertValid,
		checkACPAgent,
	}

	if runtime.GOOS == "darwin" {
		checks = append(checks, checkMkcert)
	}

	for _, fn := range checks {
		r := fn(cfg)
		report.Checks = append(report.Checks, r)

		switch r.Status {
		case CheckFail:
			report.Failures++
		case CheckWarn:
			report.Warnings++
		}
	}

	return report
}

// PrintDoctorReport renders the report to stdout.
func PrintDoctorReport(r *DoctorReport, asJSON bool) {
	if asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(r)

		return
	}

	for _, c := range r.Checks {
		icon := "✓"

		switch c.Status {
		case CheckWarn:
			icon = "⚠"
		case CheckFail:
			icon = "✗"
		}

		fmt.Printf("  %s %-40s %s\n", icon, c.Name, c.Message)

		if c.Fix != "" && c.Status != CheckOK {
			fmt.Printf("    Fix: %s\n", c.Fix)
		}
	}

	fmt.Printf("  %s\n", strings.Repeat("─", 50))

	switch {
	case r.Failures > 0:
		fmt.Printf("  %d failure(s), %d warning(s) — daemon cannot start\n\n", r.Failures, r.Warnings)
	case r.Warnings > 0:
		fmt.Printf("  All checks passed with %d warning(s).\n\n", r.Warnings)
	default:
		fmt.Printf("  All checks passed.\n\n")
	}
}

// =============================================================================
// Individual checks
// =============================================================================

// checkWorkerRuntime reports whether the mux worker has a runtime to run under.
//
// Only mux sessions need one. Agent sessions are served in-process by the Go
// ACP worker and spawn nothing at all.
//
// The search order mirrors workerRuntime in worker.go -- deno, then bun, then
// node -- because a check that only looked for one of them would report a
// broken daemon on a machine where mux runs fine under another.
func checkWorkerRuntime(_ *ServerConfig) CheckResult {
	const name = "Worker runtime (mux sessions)"

	for _, runtime := range []string{"deno", "bun", "node"} {
		if path, err := exec.LookPath(runtime); err == nil {
			return CheckResult{
				Name:    name,
				Status:  CheckOK,
				Message: path,
			}
		}
	}

	return CheckResult{
		Name:    name,
		Status:  CheckWarn,
		Message: "no deno, bun or node in PATH (only kind=\"mux\" sessions need one)",
		Fix:     NSErrors.WorkerRuntimeMissing.Fix,
	}
}

// checkACPAgent reports whether an agent session could actually run.
//
// pkg/ajan/acpfx/shim is linked into this daemon and reached in-process, so
// there is no binary of our own to look for. What CAN be missing is the vendor
// CLI the shim drives, or an external ACP agent named by NOSKILLS_ACP_COMMAND.
func checkACPAgent(_ *ServerConfig) CheckResult {
	command, _ := acpAgentCommand()

	// Empty means the in-process shim, which drives the default vendor CLI.
	if command == "" {
		command = "claude"
	}

	path, err := exec.LookPath(command)
	if err != nil {
		return CheckResult{
			Name:   "Agent CLI available",
			Status: CheckWarn,
			Message: command + " not found in PATH (agent sessions drive it; " +
				"mux sessions do not need it)",
			Fix: "Install " + command + ", or set " + envACPCommand +
				" to an external ACP agent.",
		}
	}

	return CheckResult{ //nolint:exhaustruct
		Name:    "Agent CLI available",
		Status:  CheckOK,
		Message: path,
	}
}

func checkPortFree(cfg *ServerConfig) func(*ServerConfig) CheckResult {
	return func(_ *ServerConfig) CheckResult {
		addr := cfg.H3Addr
		if !strings.Contains(addr, ":") {
			addr = ":" + addr
		}

		// UDP listener probe for QUIC
		conn, err := net.ListenPacket("udp", addr)
		if err != nil {
			return CheckResult{
				Name:    fmt.Sprintf("Port %s free", addr),
				Status:  CheckFail,
				Message: "in use",
				Fix:     NSErrors.PortInUse.Fix,
			}
		}

		_ = conn.Close()

		return CheckResult{
			Name:    fmt.Sprintf("Port %s free", addr),
			Status:  CheckOK,
			Message: "available",
		}
	}
}

func checkLedgerDir(cfg *ServerConfig) func(*ServerConfig) CheckResult {
	return func(_ *ServerConfig) CheckResult {
		dir := filepath.Join(cfg.DataDir, "sessions")

		if err := os.MkdirAll(dir, 0o700); err != nil {
			return CheckResult{
				Name:    "Ledger dir writable",
				Status:  CheckFail,
				Message: "cannot create " + dir,
				Fix:     "check disk space and permissions on " + cfg.DataDir,
			}
		}

		testFile := filepath.Join(dir, ".doctor-probe")
		if err := os.WriteFile(testFile, []byte("ok"), 0o600); err != nil {
			return CheckResult{
				Name:    "Ledger dir writable",
				Status:  CheckFail,
				Message: "write test failed: " + err.Error(),
				Fix:     NSErrors.LedgerWriteError.Fix,
			}
		}

		_ = os.Remove(testFile)

		return CheckResult{
			Name:    "Ledger dir writable",
			Status:  CheckOK,
			Message: dir,
		}
	}
}

func checkRuntimeDirPerms(cfg *ServerConfig) func(*ServerConfig) CheckResult {
	return func(_ *ServerConfig) CheckResult {
		dir := filepath.Join(cfg.DataDir, "runtime")

		if err := os.MkdirAll(dir, 0o700); err != nil {
			return CheckResult{
				Name:    "Runtime dir (0700)",
				Status:  CheckFail,
				Message: "cannot create " + dir,
				Fix:     "check permissions on " + cfg.DataDir,
			}
		}

		info, err := os.Stat(dir)
		if err != nil {
			return CheckResult{
				Name:    "Runtime dir (0700)",
				Status:  CheckWarn,
				Message: "stat failed",
			}
		}

		perms := info.Mode().Perm()
		if perms != 0o700 {
			// Try to fix automatically.
			if chmodErr := os.Chmod(dir, 0o700); chmodErr != nil { //nolint:gosec // 0700 is the required security policy for runtime dir
				return CheckResult{
					Name:    "Runtime dir (0700)",
					Status:  CheckWarn,
					Message: fmt.Sprintf("%s has %04o (need 0700)", dir, perms),
					Fix:     "chmod 0700 " + dir,
				}
			}
		}

		return CheckResult{
			Name:    "Runtime dir (0700)",
			Status:  CheckOK,
			Message: dir,
		}
	}
}

func checkCertValid(cfg *ServerConfig) CheckResult {
	certPath := filepath.Join(cfg.DataDir, "tls", "cert.pem")
	if _, err := os.Stat(certPath); os.IsNotExist(err) {
		return CheckResult{
			Name:    "TLS cert present",
			Status:  CheckWarn,
			Message: "not yet generated (will be created on first start)",
		}
	}

	return CheckResult{
		Name:    "TLS cert present",
		Status:  CheckOK,
		Message: certPath,
	}
}

func checkMkcert(_ *ServerConfig) CheckResult {
	path, err := exec.LookPath("mkcert")
	if err != nil {
		return CheckResult{
			Name:    "mkcert installed",
			Status:  CheckWarn,
			Message: "not found — daemon will use self-signed cert",
			Fix:     NSErrors.MkcertMissing.Fix,
		}
	}

	out, err := exec.Command(path, "--version").Output() //nolint:gosec // fixed args
	if err != nil {
		return CheckResult{
			Name:    "mkcert installed",
			Status:  CheckOK,
			Message: path,
		}
	}

	return CheckResult{
		Name:    "mkcert installed",
		Status:  CheckOK,
		Message: strings.TrimSpace(string(out)),
	}
}

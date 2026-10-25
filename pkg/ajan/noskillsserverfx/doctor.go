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
		checkPortFree(cfg),
		checkLedgerDir(cfg),
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

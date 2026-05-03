package noskillsserverfx

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
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
		checkNodeInstalled,
		checkNodeVersion,
		checkPortFree(cfg),
		checkLedgerDir(cfg),
		checkRuntimeDirPerms(cfg),
		checkCertValid,
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

func checkNodeInstalled(_ *ServerConfig) CheckResult {
	path, err := exec.LookPath("node")
	if err != nil {
		return CheckResult{
			Name:    "Node.js installed",
			Status:  CheckFail,
			Message: "not found in PATH",
			Fix:     NSErrors.NodeMissing.Fix,
		}
	}

	return CheckResult{
		Name:    "Node.js installed",
		Status:  CheckOK,
		Message: path,
	}
}

func checkNodeVersion(_ *ServerConfig) CheckResult {
	out, err := exec.Command("node", "--version").Output() //nolint:gosec // fixed args
	if err != nil {
		return CheckResult{
			Name:    "Node.js >= 20",
			Status:  CheckWarn,
			Message: "version check failed",
		}
	}

	ver := strings.TrimSpace(strings.TrimPrefix(string(out), "v"))

	parts := strings.SplitN(ver, ".", 2)
	major, parseErr := strconv.Atoi(parts[0])

	if parseErr != nil || major < 20 {
		return CheckResult{
			Name:    "Node.js >= 20",
			Status:  CheckFail,
			Message: "v" + ver + " (need >= 20)",
			Fix:     NSErrors.NodeVersionTooOld.Fix,
		}
	}

	return CheckResult{
		Name:    "Node.js >= 20",
		Status:  CheckOK,
		Message: "v" + ver,
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

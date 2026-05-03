package noskillsserverfx

import (
	"bytes"
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

//go:embed embed/io.eserstack.noskills-server.plist
var launchdPlist []byte

//go:embed embed/noskills-server.service
var systemdService []byte

// InstallServiceResult carries the installed path and next-step instructions.
type InstallServiceResult struct {
	Path    string
	NextCmd string
	Hint    string
}

// InstallService writes the appropriate service file for the current OS and
// prints instructions for enabling it. It returns an error on unsupported OSes.
func InstallService(binPath string) (*InstallServiceResult, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("service install: resolve home dir: %w", err)
	}

	switch runtime.GOOS {
	case "darwin":
		return installLaunchd(binPath, home)
	case "linux":
		return installSystemd(binPath, home)
	default:
		return nil, fmt.Errorf("service install: unsupported OS %q — install manually", runtime.GOOS)
	}
}

func installLaunchd(binPath, home string) (*InstallServiceResult, error) {
	dir := filepath.Join(home, "Library", "LaunchAgents")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("service install: mkdir %s: %w", dir, err)
	}

	dest := filepath.Join(dir, "io.eserstack.noskills-server.plist")
	content := applyServiceVars(launchdPlist, binPath, home)

	if err := os.WriteFile(dest, content, 0o644); err != nil { //nolint:gosec // world-readable plist is fine
		return nil, fmt.Errorf("service install: write plist: %w", err)
	}

	return &InstallServiceResult{
		Path:    dest,
		NextCmd: "launchctl load " + dest,
		Hint:    "To start automatically at login: launchctl load -w " + dest,
	}, nil
}

func installSystemd(binPath, home string) (*InstallServiceResult, error) {
	dir := filepath.Join(home, ".config", "systemd", "user")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("service install: mkdir %s: %w", dir, err)
	}

	dest := filepath.Join(dir, "noskills-server.service")
	content := applyServiceVars(systemdService, binPath, home)

	if err := os.WriteFile(dest, content, 0o644); err != nil { //nolint:gosec // world-readable unit is fine
		return nil, fmt.Errorf("service install: write unit: %w", err)
	}

	// Reload daemon if systemctl is available (best-effort).
	if path, err := exec.LookPath("systemctl"); err == nil {
		_ = exec.Command(path, "--user", "daemon-reload").Run() //nolint:gosec // fixed args
	}

	return &InstallServiceResult{
		Path:    dest,
		NextCmd: "systemctl --user enable --now noskills-server",
		Hint:    "To start automatically at login: systemctl --user enable noskills-server",
	}, nil
}

func applyServiceVars(tmpl []byte, binPath, home string) []byte {
	out := bytes.ReplaceAll(tmpl, []byte("{{BIN}}"), []byte(binPath))
	out = bytes.ReplaceAll(out, []byte("{{HOME}}"), []byte(home))

	return out
}

// BinPath returns the absolute path of the running binary.
func BinPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}

	abs, err := filepath.Abs(exe)
	if err != nil {
		return "", err
	}

	// Resolve symlinks (homebrew installs via symlink into Cellar).
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return abs, nil //nolint:nilerr // non-fatal; use unresolved path
	}

	return resolved, nil
}

// PrintlnServiceInstructions renders install result to stdout.
func PrintlnServiceInstructions(res *InstallServiceResult) {
	fmt.Printf("service file written: %s\n\n", res.Path)
	fmt.Printf("  Load now:  %s\n", res.NextCmd)

	if res.Hint != "" && !strings.HasPrefix(res.Hint, res.NextCmd) {
		fmt.Printf("  Auto-load: %s\n", res.Hint)
	}

	fmt.Println()
}

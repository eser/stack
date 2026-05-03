package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type telemetryConfig struct {
	Enabled bool `json:"enabled"`
}

// telemetryPath returns the path for the telemetry consent file.
func telemetryPath(dataDir string) string {
	return filepath.Join(dataDir, "telemetry.json")
}

// loadTelemetry reads the consent file. Returns (false, nil) if not found (not yet prompted).
func loadTelemetry(dataDir string) (telemetryConfig, bool, error) {
	path := telemetryPath(dataDir)

	data, err := os.ReadFile(path) //nolint:gosec // path is dataDir/telemetry.json, not user input
	if os.IsNotExist(err) {
		return telemetryConfig{}, false, nil
	}

	if err != nil {
		return telemetryConfig{}, false, err
	}

	var cfg telemetryConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return telemetryConfig{}, false, err
	}

	return cfg, true, nil
}

// saveTelemetry writes the consent choice to disk.
func saveTelemetry(dataDir string, cfg telemetryConfig) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return err //nolint:wrapcheck
	}

	path := telemetryPath(dataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err //nolint:wrapcheck
	}

	return os.WriteFile(path, data, 0o600) //nolint:gosec // dataDir/telemetry.json, not user input
}

// promptTelemetry prints a one-time consent prompt if stdin is a terminal and
// the consent file does not exist. Defaults to "no" if stdin is not a terminal.
// Returns the resulting config so the caller can log the outcome.
func promptTelemetry(dataDir string) telemetryConfig {
	_, found, err := loadTelemetry(dataDir)
	if err != nil || found {
		// Already decided — do not re-prompt.
		cfg, _, _ := loadTelemetry(dataDir) //nolint:errcheck
		return cfg
	}

	cfg := telemetryConfig{Enabled: false}

	stat, err := os.Stdin.Stat()
	if err != nil || (stat.Mode()&os.ModeCharDevice) == 0 {
		// Non-interactive — default no; save silently.
		_ = saveTelemetry(dataDir, cfg)

		return cfg
	}

	fmt.Printf("\n  Send anonymous TTHW timing to help improve noskills? [y/N] ")

	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		answer := strings.TrimSpace(strings.ToLower(scanner.Text()))
		if answer == "y" || answer == "yes" {
			cfg.Enabled = true
			fmt.Println("  Thanks! Anonymous timing will be sent on first session attach.")
		} else {
			fmt.Println("  OK, no telemetry.")
		}
	}

	fmt.Println()

	_ = saveTelemetry(dataDir, cfg)

	return cfg
}

// noskills-server is the coordinator daemon that owns project workspaces,
// persists noskills spec/state, spawns long-lived Claude Code sessions, and
// serves CLI, TUI, and browser clients over HTTP/3 + WebTransport.
//
// Usage:
//
//	noskills-server start [--listen :4433] [--data-dir ~/.noskills] [--self-signed]
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/noskillsserverfx"
	"github.com/eser/stack/pkg/ajan/processfx"
)

func main() {
	os.Exit(run())
}

func run() int {
	if len(os.Args) < 2 {
		printUsage()

		return 1
	}

	switch os.Args[1] {
	case "start":
		return runStart(os.Args[2:])
	case "doctor":
		return runDoctor(os.Args[2:])
	case "pin":
		return runPin(os.Args[2:])
	case "install-service":
		return runInstallService(os.Args[2:])
	case "quickstart":
		fmt.Print(string(noskillsserverfx.QuickstartDoc))

		return 0
	case "feedback":
		return runFeedback()
	case "version", "-v", "--version":
		fmt.Printf("noskills-server %s (%s/%s) commit=%s built=%s\n",
			noskillsserverfx.Version, runtime.GOOS, runtime.GOARCH,
			noskillsserverfx.Commit, noskillsserverfx.BuildDate)

		return 0
	case "help", "-h", "--help":
		if len(os.Args) > 2 && os.Args[2] == "quickstart" {
			fmt.Print(string(noskillsserverfx.QuickstartDoc))

			return 0
		}

		printUsage()

		return 0
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", os.Args[1])
		printUsage()

		return 1
	}
}

func runStart(args []string) int {
	fs := flag.NewFlagSet("start", flag.ContinueOnError)

	listen := fs.String("listen", ":4433", "UDP address to listen on (HTTP/3)")
	dataDir := fs.String("data-dir", defaultDataDir(), "daemon state directory")
	selfSigned := fs.Bool("self-signed", true, "generate a self-signed TLS cert (development mode)")
	certFile := fs.String("cert", "", "PEM cert file (overrides --self-signed)")
	keyFile := fs.String("key", "", "PEM key file (overrides --self-signed)")
	logLevel := fs.String("log-level", "INFO", "log level: DEBUG, INFO, WARN, ERROR")
	logFormat := fs.String("log-format", "text", "log format: text or json")

	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	certPEM, keyPEM, err := loadCertFiles(*certFile, *keyFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error loading cert/key: %v\n", err)

		return 1
	}

	config := &noskillsserverfx.ServerConfig{
		H3Addr:     *listen,
		DataDir:    *dataDir,
		SelfSigned: certPEM == "" && *selfSigned,
		CertString: certPEM,
		KeyString:  keyPEM,
	}

	logCfg := &logfx.Config{
		Level:      *logLevel,
		PrettyMode: *logFormat != "json",
	}

	logger := logfx.NewLogger(logfx.WithConfig(logCfg))

	ctx, cancel := signal.NotifyContext(context.Background(),
		os.Interrupt, syscall.SIGTERM)
	defer cancel()

	process := processfx.New(ctx, logger)

	srv := noskillsserverfx.New(config, logger)

	// Auto-generate PIN on first run so the banner can display it.
	var firstRunPIN string
	if !srv.AuthManager().IsPINSetup() {
		// One-time telemetry consent prompt before the daemon occupies the terminal.
		promptTelemetry(*dataDir)

		pin, pinErr := srv.AuthManager().GenerateAndSetPIN()
		if pinErr != nil {
			logger.Error("auto-generate PIN failed", "err", pinErr)
		} else {
			firstRunPIN = pin
		}
	}

	process.StartGoroutine("http3-server", func(goroutineCtx context.Context) error {
		cleanup, startErr := srv.Start(goroutineCtx)
		if startErr != nil {
			return fmt.Errorf("starting noskills-server: %w", startErr)
		}

		fingerprint := ""
		if cert := srv.Cert(); cert != nil {
			fingerprint = cert.Fingerprint
		}

		printStartupBanner(*listen, firstRunPIN, fingerprint)
		noskillsserverfx.CheckForUpdateAsync()

		<-goroutineCtx.Done()
		cleanup()

		return nil
	})

	process.Wait()

	return 0
}

// ── helpers ───────────────────────────────────────────────────────────────────

func defaultDataDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ".noskills"
	}

	return filepath.Join(home, ".noskills")
}

func loadCertFiles(certFile, keyFile string) (string, string, error) {
	if certFile == "" && keyFile == "" {
		return "", "", nil
	}

	if certFile == "" || keyFile == "" {
		return "", "", fmt.Errorf("--cert and --key must both be provided") //nolint:err113
	}

	certPEM, err := os.ReadFile(certFile) //nolint:gosec // user-provided cert file path
	if err != nil {
		return "", "", fmt.Errorf("reading cert file: %w", err)
	}

	keyPEM, err := os.ReadFile(keyFile) //nolint:gosec // user-provided cert file path
	if err != nil {
		return "", "", fmt.Errorf("reading key file: %w", err)
	}

	return string(certPEM), string(keyPEM), nil
}

func printUsage() {
	fmt.Fprintf(os.Stderr, `noskills-server — Claude Code session coordinator daemon

Usage:
  noskills-server start [flags]   Start the daemon
  noskills-server doctor          Run health checks
  noskills-server pin             Reset and reprint the daemon PIN
  noskills-server install-service Install as a system service (launchd / systemd)
  noskills-server feedback        Open a pre-filled GitHub issue
  noskills-server quickstart      Print the getting-started guide (works offline)
  noskills-server version         Print version and platform
  noskills-server help            Show this help
  noskills-server help quickstart Print the getting-started guide

Start flags:
  --listen string      UDP address to listen on (default ":4433")
  --data-dir string    Daemon state directory (default "~/.noskills")
  --self-signed        Generate self-signed TLS cert (default true)
  --cert string        PEM cert file path (overrides --self-signed)
  --key string         PEM key file path (overrides --self-signed)
  --log-level string   Log level: DEBUG, INFO, WARN, ERROR (default "INFO")
  --log-format string  Log format: text or json (default "text")
`)
}

// =============================================================================
// doctor
// =============================================================================

func runDoctor(args []string) int {
	fs := flag.NewFlagSet("doctor", flag.ContinueOnError)

	dataDir := fs.String("data-dir", defaultDataDir(), "daemon state directory")
	asJSON := fs.Bool("json", false, "output as JSON")
	listen := fs.String("listen", ":4433", "listen address to check port availability")

	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	cfg := &noskillsserverfx.ServerConfig{
		H3Addr:  *listen,
		DataDir: *dataDir,
	}

	report := noskillsserverfx.RunDoctor(cfg)
	noskillsserverfx.PrintDoctorReport(report, *asJSON)

	if report.Failures > 0 {
		return 1
	}

	return 0
}

// =============================================================================
// pin
// =============================================================================

func runPin(args []string) int {
	fs := flag.NewFlagSet("pin", flag.ContinueOnError)

	dataDir := fs.String("data-dir", defaultDataDir(), "daemon state directory")

	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	am, err := noskillsserverfx.NewAuthManager(*dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	pin, err := am.GenerateAndSetPIN()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error generating PIN: %v\n", err)

		return 1
	}

	fmt.Printf("\n  New PIN: %s\n\n", pin)
	fmt.Printf("  All existing sessions have been invalidated.\n")
	fmt.Printf("  Login at: https://localhost:4433/auth/login\n\n")

	return 0
}

// =============================================================================
// install-service
// =============================================================================

func runInstallService(args []string) int {
	fs := flag.NewFlagSet("install-service", flag.ContinueOnError)

	binPath := fs.String("bin", "", "path to the noskills-server binary (auto-detected if empty)")

	if err := fs.Parse(args); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	if *binPath == "" {
		resolved, err := noskillsserverfx.BinPath()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error auto-detecting binary path: %v\n", err)

			return 1
		}

		*binPath = resolved
	}

	res, err := noskillsserverfx.InstallService(*binPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	noskillsserverfx.PrintlnServiceInstructions(res)

	return 0
}

// =============================================================================
// feedback
// =============================================================================

func runFeedback() int {
	url := fmt.Sprintf(
		"https://github.com/eser/stack/issues/new?template=dx.yml&labels=dx&body=%%0A%%0A---%%0A**Environment**%%3A+noskills-server+%s+%%28%s%%2F%s%%29",
		noskillsserverfx.Version,
		runtime.GOOS,
		runtime.GOARCH,
	)

	fmt.Printf("\nOpen this URL to file a DX issue (version + platform are pre-filled):\n\n  %s\n\n", url)

	return 0
}

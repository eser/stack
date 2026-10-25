// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/eser/stack/pkg/ajan/noskillsserverfx"
)

// Environment variables of the dashboard, the ones `noskills web` read.
const (
	envWebToken       = "NOSKILLS_WEB_TOKEN"
	envWebDebugErrors = "NOSKILLS_WEB_DEBUG_ERRORS"
)

// webOptions are the parsed flags of `web`.
type webOptions struct {
	root     string
	port     int
	open     bool
	logLevel string
}

// parseWebArgs parses the flags of `web`.
func parseWebArgs(args []string) (webOptions, error) {
	fs := flag.NewFlagSet("web", flag.ContinueOnError)

	root := fs.String("root", "", "project root (default: the nearest directory with .eser/, else the working directory)")
	port := fs.Int("port", noskillsserverfx.DashboardDefaultPort, "port to listen on, on 127.0.0.1")
	open := fs.Bool("open", false, "open the dashboard in the default browser")
	logLevel := fs.String("log-level", "WARN", "log level: DEBUG, INFO, WARN, ERROR")

	if err := fs.Parse(args); err != nil {
		return webOptions{}, fmt.Errorf("parse the web flags: %w", err)
	}

	if *port < 1 || *port > 65535 {
		return webOptions{}, fmt.Errorf("--port %d is not a port number; pass an integer from 1 to 65535", *port) //nolint:err113
	}

	return webOptions{root: *root, port: *port, open: *open, logLevel: *logLevel}, nil
}

// browserOpener is the command that opens a URL in the default browser.
// start is a cmd built-in, and its first quoted argument is a window title.
func browserOpener(url string) *exec.Cmd {
	ctx := context.Background()

	switch runtime.GOOS {
	case "darwin":
		return exec.CommandContext(ctx, "open", url)
	case "windows":
		return exec.CommandContext(ctx, "cmd", "/c", "start", "", url)
	default:
		return exec.CommandContext(ctx, "xdg-open", url)
	}
}

// runWeb is `noskills-server web`: the dashboard of one project on
// 127.0.0.1, as `noskills web` served it from TypeScript.
func runWeb(args []string) int {
	options, err := parseWebArgs(args)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	root, err := noskillsfx.ResolveProjectRoot(options.root)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	if !noskillsfx.IsHookInitialized(root) {
		fmt.Fprintln(os.Stderr, "noskills is not initialized. Run: noskills init")

		return 1
	}

	debugErrors := os.Getenv(envWebDebugErrors)
	logger := logfx.NewLogger(logfx.WithWriter(os.Stderr), logfx.WithConfig(&logfx.Config{Level: options.logLevel})) //nolint:exhaustruct

	dashboard, err := noskillsserverfx.NewDashboard(&noskillsserverfx.DashboardConfig{ //nolint:exhaustruct
		Root:        root,
		Token:       os.Getenv(envWebToken),
		DebugErrors: debugErrors == "1" || debugErrors == "true",
	}, logger)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	listener, err := noskillsserverfx.ListenDashboard(ctx, options.port)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)

		return 1
	}

	url := "http://localhost:" + strconv.Itoa(options.port)
	fmt.Printf("noskills web → %s\n", url)

	if options.open {
		// A convenience: the URL is printed above when it cannot open.
		_ = browserOpener(url).Run()
	}

	stopNotice := context.AfterFunc(ctx, func() { fmt.Println("\nShutting down...") })
	defer stopNotice()

	if err := dashboard.Serve(ctx, listener); err != nil {
		logger.Error("noskills web stopped with an error", "err", err)

		return 1
	}

	return 0
}

package main

import (
	"context"
	"fmt"
	"os"

	"github.com/eser/stack/pkg/ajan/api/adapters/appcontext"
)

const version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	ctx := context.Background()
	cmd := os.Args[1]

	var err error

	switch cmd {
	case "version", "-v", "--version":
		fmt.Printf("ajan %s\n", version)
	case "serve":
		err = runServe(ctx)
	case "help", "-h", "--help":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`ajan - eserstack Go runtime

Usage:
  ajan <command> [options]

Commands:
  serve     Start the HTTP server
  version   Print version information
  help      Show this help message

Run 'go run ./cmd/ajan <command>' or 'eser ajan <command>'`)
}

func runServe(ctx context.Context) error {
	appCtx, err := appcontext.New(ctx)
	if err != nil {
		return fmt.Errorf("initializing application: %w", err)
	}

	appCtx.Process.Wait()

	return nil
}

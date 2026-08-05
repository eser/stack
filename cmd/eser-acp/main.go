// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// eser-acp presents a vendor coding-agent CLI as an ACP agent on stdio.
//
// It is the agent half of the Agent Client Protocol: an ACP client spawns this
// binary, speaks JSON-RPC 2.0 to it over stdin/stdout, and this process drives
// the vendor CLI beneath. That is the same role Zed's claude-code-acp plays,
// implemented here so the stack depends on no third-party Node adapter.
//
// Usage:
//
//	eser-acp [--backend claude-code] [-- <extra vendor args>]
//
// Note that stdout is the protocol stream: nothing may be printed to it except
// JSON-RPC frames. Diagnostics go to stderr.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/eser/stack/pkg/ajan/acpfx"
	"github.com/eser/stack/pkg/ajan/acpfx/shim"
)

// version is the agent version reported in initialize.
const version = "0.1.0"

func main() {
	if err := run(); err != nil {
		fmt.Fprintf(os.Stderr, "eser-acp: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	backendName := flag.String(
		"backend", "claude-code", "vendor backend to drive: claude-code, kiro or opencode",
	)
	command := flag.String("command", "", "override the vendor binary path")
	model := flag.String("model", "", "model to pass to the vendor CLI")

	flag.Parse()

	backend, err := selectBackend(*backendName, *command, *model, flag.Args())
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// stdin and stdout are the protocol stream. The client owns this process's
	// lifetime, so there is no closer to hand over.
	agent := acpfx.NewAgent(os.Stdin, os.Stdout, nil, shim.New(backend, version))

	select {
	case <-agent.Done():
		// The client closed the connection, or the pipe broke.
		return nil

	case <-ctx.Done():
		return agent.Close() //nolint:wrapcheck
	}
}

// selectBackend resolves the --backend name to an implementation.
//
// --model is folded into the extra args rather than modelled per backend: all
// three CLIs spell it --model, and prepending it keeps an explicit
// `-- --model x` from the caller as the last word.
func selectBackend( //nolint:ireturn
	name, command, model string,
	extraArgs []string,
) (shim.Backend, error) {
	if model != "" {
		extraArgs = append([]string{"--model", model}, extraArgs...)
	}

	switch name {
	case "claude-code":
		return &shim.ClaudeCode{Command: command, ExtraArgs: extraArgs}, nil

	case "kiro":
		return &shim.Kiro{Command: command, ExtraArgs: extraArgs}, nil //nolint:exhaustruct

	case "opencode":
		return &shim.OpenCode{Command: command, ExtraArgs: extraArgs}, nil //nolint:exhaustruct

	default:
		return nil, fmt.Errorf("%w: %s", errUnknownBackend, name)
	}
}

var errUnknownBackend = fmt.Errorf("unknown backend") //nolint:err113

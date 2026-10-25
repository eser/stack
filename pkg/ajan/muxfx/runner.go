// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"time"
)

// disposeTimeout bounds the teardown after the frontend ends; KillAll's own
// grace periods fit inside it.
const disposeTimeout = 10 * time.Second

// RunInProcessOptions configures [RunInProcess].
type RunInProcessOptions struct {
	// Shell and ShellArgs replace the default shell of terminal panes: $SHELL
	// or /bin/sh, powershell.exe on Windows.
	Shell     string
	ShellArgs []string
	Cwd       string
	// ResolveSpawn decides what every pane runs, replacing the shell defaults.
	ResolveSpawn SpawnResolver
	// Frontend overrides the terminal frontend options; Transport and Keymap
	// are filled in.
	Frontend TuiFrontendOptions
}

func defaultShell() string {
	if runtime.GOOS == "windows" {
		return "powershell.exe"
	}

	if shell := os.Getenv("SHELL"); shell != "" {
		return shell
	}

	return "/bin/sh"
}

// shellResolver runs the pane's own command, or the configured shell.
func shellResolver(opts *RunInProcessOptions) SpawnResolver {
	return func(pane *Pane, _ Geom) SpawnSpec {
		command := defaultShell()

		var args []string

		if opts.Shell != "" {
			command = opts.Shell
			args = opts.ShellArgs
		}

		if pane.Command != "" {
			command = pane.Command
			args = pane.Args
		}

		cwd := opts.Cwd
		if pane.Cwd != "" {
			cwd = pane.Cwd
		}

		return SpawnSpec{Command: command, Args: args, Cwd: cwd, Env: os.Environ()}
	}
}

// RunInProcess runs the server and the terminal frontend in one process, with
// a shell in the first pane, until the session ends.
func RunInProcess(ctx context.Context, opts *RunInProcessOptions) error {
	frontendOpts := opts.Frontend
	if frontendOpts.TerminalSize == nil {
		frontendOpts.TerminalSize = defaultTerminalSize
	}

	resolve := opts.ResolveSpawn
	if resolve == nil {
		resolve = shellResolver(opts)
	}

	server := NewServer(&ServerOptions{
		InitialState: NewInitialState(frontendOpts.TerminalSize()),
		ResolveSpawn: resolve,
	})

	serverSide, frontendSide := NewInProcessPair[ServerToFrontend, FrontendToServer]()
	server.Connect(serverSide)

	frontendOpts.Transport = frontendSide
	if frontendOpts.Keymap == nil {
		frontendOpts.Keymap = DefaultKeymap()
	}

	frontend := NewTuiFrontend(&frontendOpts)

	// Open the first tab; the frontend's attach pulls a full scene.
	server.Dispatch(&Action{Type: ActionNewTab})

	runErr := frontend.Run(ctx)
	frontend.Stop()

	disposeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), disposeTimeout)
	defer cancel()

	disposeErr := server.Dispose(disposeCtx)

	if runErr != nil {
		return fmt.Errorf("run mux frontend: %w", runErr)
	}

	return disposeErr
}

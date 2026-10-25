// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"slices"
	"strings"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/codebasefx"
	"github.com/eser/stack/pkg/ajan/csfx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

// env is everything the CLI reads from or does to the outside world, so
// tests run it against buffers, fake bins and a local HTTP server.
type env struct {
	stdin  io.Reader
	stdout io.Writer
	stderr io.Writer

	getenv     func(key string) string
	environ    func() []string
	lookPath   func(file string) (string, error)
	executable func() (string, error)
	homeDir    func() (string, error)

	cwd     string
	goos    string
	goarch  string
	version string

	httpClient *http.Client

	// ollamaURL is where `eser ai` looks for ollama; "" is localhost:11434.
	ollamaURL string
	// aiFactories replaces the built-in AI provider factories when set.
	aiFactories func() []aifx.ProviderFactory

	// tapURL is the homebrew-tap clone URL; "" is GitHub with GH_TOKEN.
	tapURL string
	// releaseBuild compiles one release binary; nil runs go build.
	releaseBuild func(ctx context.Context, root string, binary codebasefx.ReleaseBinary,
		target codebasefx.ReleaseTarget, version, out string) error

	// resourceKeys lists a Kubernetes resource's data keys; nil runs kubectl.
	resourceKeys func(ref csfx.ResourceReference) ([]string, error)
	releases     releaseEndpoints

	// runProcess runs a program with the CLI's stdio and returns its exit code.
	runProcess func(ctx context.Context, e *env, name string, args []string, dir string) (int, error)
}

// runInheritingStdio runs a program attached to the CLI's own streams.
func runInheritingStdio(ctx context.Context, e *env, name string, args []string, dir string) (int, error) {
	cmd := exec.CommandContext(ctx, name, args...) //nolint:gosec // G204: the program is a resolved plugin or sh, chosen by the user's command
	cmd.Stdin = e.stdin
	cmd.Stdout = e.stdout
	cmd.Stderr = e.stderr
	cmd.Dir = dir

	err := cmd.Run()

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), nil
	}

	if err != nil {
		return clifx.ExitFailure, fmt.Errorf("run %s: %w", name, err)
	}

	return clifx.ExitOK, nil
}

// builtinCommands are the commands the Go CLI implements itself.
func builtinCommands(e *env) []*clifx.Command {
	return []*clifx.Command{
		{
			Name:  "version",
			Short: "Print the eser version",
			Run: func(c *clifx.Context) error {
				return c.Output(map[string]string{"version": e.version}, func(w io.Writer) error {
					_, err := fmt.Fprintln(w, "eser", e.version)

					return err
				})
			},
		},
		installCommand(e),
		updateCommand(e),
		uninstallCommand(e),
		doctorCommand(e),
		codebaseCommand(e),
		kitCommand(e),
		csCommand(e),
		aiCommand(e),
		devCommand(e),
	}
}

// newApp builds the clifx application: the built-in commands, and the
// manifest scripts so help and completions list them.
func newApp(e *env, scripts map[string]workflowfx.ScriptConfig) *clifx.App {
	commands := builtinCommands(e)

	names := make([]string, 0, len(scripts))
	for name := range scripts {
		names = append(names, name)
	}

	slices.Sort(names)

	for _, name := range names {
		short := scripts[name].Description
		if short == "" {
			short = "Runs: " + scripts[name].Command
			if runes := []rune(short); len(runes) > 60 {
				short = string(runes[:59]) + "…"
			}
		}

		// Listed for help and completions only; run() dispatches scripts
		// before clifx, so their arguments reach the script untouched.
		commands = append(commands, &clifx.Command{Name: name, Short: short}) //nolint:exhaustruct
	}

	return &clifx.App{
		Name:    "eser",
		Version: e.version,
		Stdin:   e.stdin,
		Stdout:  e.stdout,
		Stderr:  e.stderr,
		Root: &clifx.Command{ //nolint:exhaustruct
			Long: "eser runs the manifest scripts of .eser/manifest.yml, manages its own install, and " +
				"forwards other commands to plugins (eser-<name> on PATH, laroux, noskills, eser-posts).",
			Subcommands: commands,
		},
	}
}

// run dispatches one invocation: built-in commands and help through clifx,
// then a manifest script, then a plugin.
func run(ctx context.Context, e *env, args []string) int {
	scripts, manifestErr := loadScripts(e.cwd)

	app := newApp(e, scripts)

	if len(args) == 0 || strings.HasPrefix(args[0], "-") || isBuiltin(e, args[0]) {
		return app.Run(ctx, args)
	}

	name, rest := args[0], args[1:]

	if manifestErr != nil {
		_, _ = fmt.Fprintf(e.stderr, "eser: %v\n", manifestErr)

		return clifx.ExitFailure
	}

	if _, ok := scripts[name]; ok {
		return runScript(ctx, e, scripts, name, rest)
	}

	return forward(ctx, e, name, rest)
}

func isBuiltin(e *env, name string) bool {
	if name == "help" || name == "completion" || name == "__complete" {
		return true
	}

	for _, cmd := range builtinCommands(e) {
		if cmd.Name == name || slices.Contains(cmd.Aliases, name) {
			return true
		}
	}

	return false
}

// loadScripts reads the scripts of the manifest in dir. A directory without a
// manifest has no scripts; a broken manifest is an error for script and
// plugin dispatch only, so `eser --help` still works.
func loadScripts(dir string) (map[string]workflowfx.ScriptConfig, error) {
	config, err := workflowfx.LoadManifest(dir)
	if errors.Is(err, workflowfx.ErrManifestNotFound) {
		return map[string]workflowfx.ScriptConfig{}, nil
	}

	if err != nil {
		return map[string]workflowfx.ScriptConfig{}, err //nolint:wrapcheck // a ManifestError names the file and path itself
	}

	if config.Scripts == nil {
		return map[string]workflowfx.ScriptConfig{}, nil
	}

	return config.Scripts, nil
}

// fileExists reports whether path is an existing regular file.
func fileExists(path string) bool {
	info, err := os.Stat(path)

	return err == nil && info.Mode().IsRegular()
}

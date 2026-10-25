// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsserverfx

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The process adapters the spec endpoints give the noskillsfx lifecycle:
// git for the user's identity, a shell for the manifest's verifyCommand and
// the provider checks of a first `init`.

// lifecycleEnv is the lifecycle environment for a project at root.
func lifecycleEnv(root string) *noskillsfx.LifecycleEnv {
	return noskillsfx.ServiceLifecycleEnv(root, execGit, execShell)
}

func execGit(ctx context.Context, git string, args []string, dir string) (string, bool, error) {
	cmd := exec.CommandContext(ctx, git, args...) //nolint:gosec // G204: git with noskills' own arguments

	cmd.Dir = dir

	var stdout bytes.Buffer

	cmd.Stdout = &stdout

	err := cmd.Run()

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return "", false, nil
	}

	if err != nil {
		return "", false, err //nolint:wrapcheck // the lifecycle treats any error as no identity
	}

	return stdout.String(), true, nil
}

func execShell(ctx context.Context, command, dir string) (string, string, bool, error) {
	name, args := "sh", []string{"-c", command}
	if runtime.GOOS == "windows" {
		name, args = "cmd.exe", []string{"/d", "/s", "/c", command}
	}

	cmd := exec.CommandContext(ctx, name, args...) //nolint:gosec // G204: the verifyCommand the project's manifest sets

	cmd.Dir = dir

	var stdout, stderr bytes.Buffer

	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	var exitErr *exec.ExitError
	if err != nil && !errors.As(err, &exitErr) {
		return stdout.String(), stderr.String(), false, err //nolint:wrapcheck // reported as the CLI reports it
	}

	return stdout.String(), stderr.String(), err == nil, nil
}

// providerProbe checks for the provider programs on PATH, a local Ollama
// with a one-second budget, and the API key variables.
func providerProbe(ctx context.Context) noskillsfx.ProviderProbe {
	return noskillsfx.ProviderProbe{
		HasBinary: func(name string) bool {
			_, err := exec.LookPath(name)

			return err == nil
		},
		OllamaReachable: func() bool {
			probeCtx, cancel := context.WithTimeout(ctx, time.Second)
			defer cancel()

			request, err := http.NewRequestWithContext(probeCtx, http.MethodGet, "http://localhost:11434/api/version", nil)
			if err != nil {
				return false
			}

			response, err := http.DefaultClient.Do(request)
			if err != nil {
				return false
			}

			_ = response.Body.Close()

			return response.StatusCode >= http.StatusOK && response.StatusCode < http.StatusMultipleChoices
		},
		LookupEnv: os.LookupEnv,
	}
}

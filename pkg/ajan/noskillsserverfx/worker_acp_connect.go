package noskillsserverfx

import (
	"context"
	"fmt"
	"os/exec"

	"github.com/eser/stack/pkg/ajan/acpfx"
	"github.com/eser/stack/pkg/ajan/acpfx/shim"
)

// connectACPAgent links the worker to an agent, in this process or another.
//
// The default path spawns nothing. Our shim is Go code compiled into this
// daemon, so it is reached in-process: no subprocess, and nothing that has to
// be installed on PATH.
//
// An external agent is a different matter: gemini --acp and claude-agent-acp
// really are other programs, and NOSKILLS_ACP_COMMAND is how you point at one.
func connectACPAgent(
	ctx context.Context,
	command string,
	args []string,
	cwd string,
	worker *acpWorker,
	info *acpfx.Implementation,
) (*acpfx.Client, error) {
	if command == "" {
		backend, err := shimBackend(defaultACPBackend, args)
		if err != nil {
			return nil, err
		}

		client, err := acpfx.InProcess(ctx, shim.New(backend, "1"), worker, info)
		if err != nil {
			return nil, fmt.Errorf("start in-process acp agent: %w", err)
		}

		return client, nil
	}

	client, err := acpfx.Spawn(ctx, acpfx.SpawnOptions{ //nolint:exhaustruct
		Command: command,
		Args:    args,
		Cwd:     cwd,
	}, worker, info)
	if err != nil {
		// The exec error alone names a path without saying where it should have
		// come from. Checking after the failure keeps the happy path free of an
		// extra PATH lookup.
		if _, lookErr := exec.LookPath(command); lookErr != nil {
			return nil, fmt.Errorf(
				"%w: %q not found (set %s to its path, or unset it to use the built-in agent)",
				ErrACPAgentMissing, command, envACPCommand,
			)
		}

		return nil, fmt.Errorf("spawn acp agent %q: %w", command, err)
	}

	return client, nil
}

// shimBackend builds the vendor backend the in-process shim drives.
func shimBackend(name string, extraArgs []string) (shim.Backend, error) { //nolint:ireturn
	switch name {
	case "claude-code":
		return &shim.ClaudeCode{Command: "", ExtraArgs: extraArgs}, nil
	case "kiro":
		return &shim.Kiro{ExtraArgs: extraArgs}, nil //nolint:exhaustruct
	case "opencode":
		return &shim.OpenCode{ExtraArgs: extraArgs}, nil //nolint:exhaustruct
	default:
		return nil, fmt.Errorf("%w: unknown acp backend %q", ErrACPAgentMissing, name)
	}
}

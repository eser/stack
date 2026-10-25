// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"io"
	"sync"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// `noskills invoke-hook <event>`: the hooks the generated tool configs run.
// Port of the dispatcher in pkg/@eserstack/noskills/commands/invoke-hook.ts.
// This file does the process I/O (stdin, the environment, stdout, stderr
// and the exit code); noskillsfx makes the decisions and reads and writes
// the project's files. An event this binary does not know answers nothing
// and succeeds, as the TypeScript dispatcher does.

// hookRun is one hook invocation.
type hookRun struct {
	e *env

	mu     sync.Mutex
	warned map[string]bool
}

func (h *hookRun) stderr(text string) {
	h.mu.Lock()
	defer h.mu.Unlock()

	_, _ = io.WriteString(h.e.stderr, text)
}

// warn prints the TypeScript CLI's corrupt-state warning, once per file.
func (h *hookRun) warn(path string, err error) {
	h.mu.Lock()
	seen := h.warned[path]
	h.warned[path] = true
	h.mu.Unlock()

	if !seen {
		h.stderr(noskillsfx.CorruptStateWarning(path, err) + "\n")
	}
}

func invokeHook(c *clifx.Context, e *env) error {
	if len(c.Args) == 0 {
		return nil
	}

	h := &hookRun{e: e, mu: sync.Mutex{}, warned: map[string]bool{}}
	rest := c.Args[1:]

	switch c.Args[0] {
	case "pre-tool-use":
		return h.preToolUse()
	case "stop":
		h.stop(c.Context)
	case "post-file-write":
		input := h.readInput()
		noskillsfx.PostFileWriteHook(input, h.rootOf(input), e.now())
	case "post-bash":
		input := h.readInput()
		noskillsfx.PostBashHook(input, h.rootOf(input), e.now())
	case "session-start":
		return h.sessionStart(c.Context, rest)
	case "post-ask-user-question":
		h.postAskUserQuestion()
	case "git-exec":
		return h.gitExec(c.Context, rest)
	}

	return nil
}

// readInput reads the hook JSON on stdin. Input that cannot be read or is
// not a JSON object is an empty input, which every hook treats as a call
// with nothing to check.
func (h *hookRun) readInput() noskillsfx.HookInput {
	data, err := io.ReadAll(h.e.stdin)
	if err != nil {
		return noskillsfx.ParseHookInput("")
	}

	return noskillsfx.ParseHookInput(string(data))
}

// rootOf is the project root for a tool hook: the tool's cwd, then
// NOSKILLS_PROJECT_ROOT, then the working directory.
func (h *hookRun) rootOf(input noskillsfx.HookInput) string {
	return noskillsfx.HookRoot(input, h.e.getenv("NOSKILLS_PROJECT_ROOT"), h.e.cwd)
}

func (h *hookRun) preToolUse() error {
	input := h.readInput()

	decision := noskillsfx.DecidePreToolUse(input, &noskillsfx.HookEnv{
		Root:      h.rootOf(input),
		SessionID: h.e.getenv("NOSKILLS_SESSION"),
		Now:       h.e.now,
		Warn:      h.warn,
		Notice:    h.stderr,
	})

	stdout, stderr, code := noskillsfx.PreToolUseAnswer(decision, noskillsfx.HookDialectOf(input))
	if stdout != "" {
		_, _ = io.WriteString(h.e.stdout, stdout)
	}

	if stderr != "" {
		h.stderr(stderr)
	}

	return exitWith(code)
}

func (h *hookRun) stop(ctx context.Context) {
	input := h.readInput()

	notice := noskillsfx.StopHook(ctx, input, &noskillsfx.StopHookInput{
		Root:    h.rootOf(input),
		Run:     h.e.runGit,
		Git:     "git",
		IsAlive: h.e.isAlive,
		Now:     h.e.now(),
	})

	// stderr on exit 0 reaches the user, not the agent.
	if notice != "" {
		h.stderr(notice)
	}
}

func (h *hookRun) postAskUserQuestion() {
	input := h.readInput()

	token, err := h.e.randomToken()
	if err != nil {
		return // the token is best effort and must never break the agent
	}

	noskillsfx.ProcessAskUserQuestion(input, h.rootOf(input), h.e.now(), token, h.warn)
}

// sessionStart puts the current noskills instruction into the agent's
// context and writes the git wrapper. It reads no stdin: OpenCode plugins
// generated before the plugin passed stdin ran it with the terminal as
// stdin.
func (h *hookRun) sessionStart(ctx context.Context, args []string) error {
	root, set := h.e.lookupEnv("NOSKILLS_PROJECT_ROOT")
	if !set {
		root = h.e.cwd
	}

	if !noskillsfx.IsHookInitialized(root) {
		return nil
	}

	output := noskillsfx.SessionStart(root, noskillsfx.SessionStartDialect(args), h.e.now(), h.warn,
		func(commandPrefix string) { h.exportGitWrapper(ctx, root, commandPrefix) })

	_, _ = io.WriteString(h.e.stdout, output)

	return nil
}

// exportGitWrapper writes the git wrapper and, in a Claude Code session,
// puts it first on the PATH of every Bash command through CLAUDE_ENV_FILE.
// A failure is reported to the user and does not stop the session.
func (h *hookRun) exportGitWrapper(ctx context.Context, root, commandPrefix string) {
	wrapper, err := noskillsfx.InstallGitWrapper(ctx, &noskillsfx.InstallGitWrapperOptions{
		Root:                root,
		CommandPrefix:       commandPrefix,
		PathValue:           h.e.getenv("PATH"),
		GOOS:                h.e.goos,
		Run:                 h.e.runGit,
		CheckTimeoutSeconds: 0,
	})
	if err == nil && wrapper != nil {
		if envFile := h.e.getenv("CLAUDE_ENV_FILE"); envFile != "" {
			err = noskillsfx.ExportFromEnvFile(envFile, wrapper.BinDir)
		}
	}

	if err != nil {
		h.stderr(noskillsfx.GitWrapperNotInstalled(root, err))
	}
}

// gitExec is the check behind the agent-session git wrapper. It exits 0
// when the command may run; otherwise it prints the reason and exits with
// GitExecDeniedExitCode. The wrapper passes the project root, the real git
// and the directory git would run in; a call without them resolves them.
func (h *hookRun) gitExec(ctx context.Context, args []string) error {
	root, set := h.e.lookupEnv("NOSKILLS_PROJECT_ROOT")
	if !set {
		root = noskillsfx.FindProjectRoot(h.e.cwd)
		if root == "" {
			root = h.e.cwd
		}
	}

	// An empty NOSKILLS_REAL_GIT is resolved too: running "" would leave the
	// repository unknown.
	realGit := h.e.getenv("NOSKILLS_REAL_GIT")
	if realGit == "" {
		realGit = noskillsfx.ResolveRealGit(h.e.getenv("PATH"), noskillsfx.WrapperBinDir(root))
	}

	if realGit == "" {
		h.stderr("noskills: no git binary found on PATH outside the noskills wrapper directory.\n")

		return exitWith(clifx.ExitFailure)
	}

	cwd, set := h.e.lookupEnv("NOSKILLS_GIT_CWD")
	if !set {
		cwd = h.e.cwd
	}

	denial, err := noskillsfx.CheckGitExec(ctx, args, &noskillsfx.GitExecContext{
		Root: root, RealGit: realGit, Cwd: cwd, Run: h.e.runGit,
	})
	if err != nil {
		// The wrapper refuses the command on any exit code but 0.
		h.stderr("noskills: could not check the git command: " + err.Error() + "\n")

		return exitWith(clifx.ExitFailure)
	}

	if denial == "" {
		return nil
	}

	h.stderr(denial + "\n")

	return exitWith(noskillsfx.GitExecDeniedExitCode)
}

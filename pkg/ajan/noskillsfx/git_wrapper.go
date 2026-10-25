// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The git wrapper for agent sessions: a POSIX shell script named git that
// goes first on the agent's PATH, so every git process the session starts
// runs through it, including one an interpreter assembles at run time, which
// the PreToolUse hook cannot judge from the command text. Reads, clones and
// commands on other repositories run directly; the rest goes to
// `noskills invoke-hook git-exec`, which refuses pushes from anywhere and
// other writes to the project's repository while allowGit is false. Port of
// commands/git-wrapper.ts and commands/git-wrapper-install.ts.

const (
	// WrapperDir is where the wrapper lives, relative to the project root.
	WrapperDir = ".eser/.state/bin"
	// GitExecDeniedExitCode is the exit code of `invoke-hook git-exec` when
	// it refuses the command.
	GitExecDeniedExitCode = 3
	// GitCheckTimeoutSeconds is how long the wrapper waits for the check
	// before refusing the command. It was set for checks that start through
	// npx, which may wait on the npm registry; the Go binary answers in
	// milliseconds.
	GitCheckTimeoutSeconds = 30
	// GitCheckKillGraceSeconds is how long a check has to exit after SIGTERM
	// before it gets SIGKILL.
	GitCheckKillGraceSeconds = 2

	checkTimedOutExitCode = 124
	revParseTimeout       = 5 * time.Second
)

var errCheckTimeout = errors.New("checkTimeoutSeconds must be a positive whole number of seconds")

// GitExecKind is how the wrapper's check treats one git command.
type GitExecKind string

const (
	// GitExecRead only reads repository state; it always runs.
	GitExecRead GitExecKind = "read"
	// GitExecClone creates a new repository; it always runs.
	GitExecClone GitExecKind = "clone"
	// GitExecPush sends commits to another repository; refused everywhere.
	GitExecPush GitExecKind = "push"
	// GitExecWrite changes the repository it runs in; refused in the project's.
	GitExecWrite GitExecKind = "write"
)

// ClassifyGitExec classifies the arguments git receives.
func ClassifyGitExec(args []string) GitExecKind {
	switch {
	case IsGitArgsAllowed(args):
		return GitExecRead
	case IsGitRemoteWrite(args):
		return GitExecPush
	case SplitGitArgs(args).Subcommand == "clone":
		return GitExecClone
	default:
		return GitExecWrite
	}
}

// GitExecDenial is the message an agent sees when the wrapper refuses a git
// command.
func GitExecDenial(args []string) string {
	return `noskills: refused "git ` + SplitGitArgs(args).Subcommand +
		`". This agent session may only read git while allowGit is false in .eser/manifest.yml. ` +
		`The user controls git, the agent controls files.`
}

func pathEntries(pathValue string) []string {
	var entries []string

	for _, entry := range strings.Split(pathValue, ":") {
		if entry != "" {
			entries = append(entries, entry)
		}
	}

	return entries
}

// PrependToPath returns PATH with dir first and no other occurrence of it.
func PrependToPath(pathValue, dir string) string {
	entries := []string{dir}

	for _, entry := range pathEntries(pathValue) {
		if entry != dir {
			entries = append(entries, entry)
		}
	}

	return strings.Join(entries, ":")
}

// RemoveFromPath returns PATH without dir.
func RemoveFromPath(pathValue, dir string) string {
	return strings.Join(slices.DeleteFunc(pathEntries(pathValue), func(e string) bool { return e == dir }), ":")
}

// ShellQuote quotes a value as one POSIX shell word.
func ShellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

// EnvFileExport is the line a Claude Code SessionStart hook appends to
// CLAUDE_ENV_FILE, which Claude Code runs before every Bash command.
func EnvFileExport(binDir string) string {
	return "export PATH=" + ShellQuote(binDir) + `:"$PATH"` + "\n"
}

// WrapperScriptOptions is what BuildWrapperScript bakes into the script.
type WrapperScriptOptions struct {
	// RealGit is the absolute path of the git binary the wrapper runs.
	RealGit string
	// ProjectGitDir is the project's common git directory.
	ProjectGitDir string
	// ProjectRoot is the noskills project root, passed to the check.
	ProjectRoot string
	// CommandPrefix runs noskills, as the hooks run it; shell syntax, so it
	// goes into the script unquoted.
	CommandPrefix string
	// CheckTimeoutSeconds is how long the wrapper waits for the check; 0
	// means GitCheckTimeoutSeconds.
	CheckTimeoutSeconds int
}

func casePattern(values []string) string {
	parts := make([]string, len(values))

	for i, value := range values {
		if value == "" {
			parts[i] = "''"
		} else {
			parts[i] = value
		}
	}

	return strings.Join(parts, "|")
}

// BuildWrapperScript returns the wrapper script. It only allows on its own;
// every refusal comes from the noskills check, which reads allowGit at the
// time of the call. A check that does not exit in time is stopped, and the
// command is refused.
func BuildWrapperScript(opts *WrapperScriptOptions) (string, error) {
	checkTimeout := opts.CheckTimeoutSeconds
	if checkTimeout == 0 {
		checkTimeout = GitCheckTimeoutSeconds
	}

	if checkTimeout < 0 {
		return "", fmt.Errorf("%w, got %d", errCheckTimeout, checkTimeout)
	}

	var inline []string

	for _, flag := range append(gitGlobalFlagsWithArg(), gitGlobalFlagsInlineArg()...) {
		if strings.HasPrefix(flag, "--") {
			inline = append(inline, flag+"=*")
		}
	}

	direct := append([]string{""}, GitAllowedSubcommands()...)
	direct = append(direct, gitInfoOptions()...)
	direct = append(direct, "clone")

	conditional := make([]string, 0, len(gitConditionalReads()))
	for _, read := range gitConditionalReads() {
		conditional = append(conditional, "  "+read.subcommand+")\n    case $first_arg in\n      "+
			casePattern(read.firstArgs)+") exec \"$real_git\" \"$@\" ;;\n    esac\n    ;;")
	}

	timeout := strconv.Itoa(checkTimeout)
	grace := strconv.Itoa(GitCheckKillGraceSeconds)
	timedOut := strconv.Itoa(checkTimedOutExitCode)
	denied := strconv.Itoa(GitExecDeniedExitCode)

	replacer := strings.NewReplacer(
		"@REAL_GIT@", ShellQuote(opts.RealGit),
		"@PROJECT_GIT_DIR@", ShellQuote(opts.ProjectGitDir),
		"@OPTIONS_WITH_VALUE@", casePattern(gitGlobalFlagsWithArg()),
		"@INLINE_OPTIONS@", casePattern(inline),
		"@OPTIONS_WITHOUT_VALUE@", casePattern(gitGlobalFlagsNoArg()),
		"@DIRECT_SUBCOMMANDS@", casePattern(direct),
		"@CONDITIONAL_READS@", strings.Join(conditional, "\n"),
		"@REMOTE_WRITES@", casePattern(gitRemoteWriteSubcommands()),
		"@PROJECT_ROOT@", ShellQuote(opts.ProjectRoot),
		"@COMMAND_PREFIX@", opts.CommandPrefix,
		"@TIMEOUT@", timeout,
		"@GRACE@", grace,
		"@TIMED_OUT@", timedOut,
		"@DENIED@", denied,
	)

	return replacer.Replace(wrapperScriptTemplate), nil
}

// wrapperScriptTemplate is the script of git-wrapper.ts, byte for byte once
// the @NAME@ markers are replaced.
const wrapperScriptTemplate = `#!/bin/sh
# Generated by noskills when an agent session starts; edits are overwritten.
#
# Agent sessions find this file first on PATH, so every git process they start
# runs through it. Reads, clones and commands on other repositories run
# directly. Everything else is checked by noskills, which refuses git writes to
# the project's repository, and pushes from anywhere, while allowGit is false.

real_git=@REAL_GIT@
project_git_dir=@PROJECT_GIT_DIR@

# Find the subcommand and its first argument after git's own options.
subcommand=''
first_arg=''
found=0
takes_value=0
for arg in "$@"; do
  if [ "$found" = 1 ]; then
    first_arg=$arg
    break
  fi
  if [ "$takes_value" = 1 ]; then
    takes_value=0
    continue
  fi
  case $arg in
    @OPTIONS_WITH_VALUE@) takes_value=1 ;;
    -C?*|-c?*|@INLINE_OPTIONS@) ;;
    @OPTIONS_WITHOUT_VALUE@) ;;
    *)
      subcommand=$arg
      found=1
      ;;
  esac
done

case $subcommand in
  @DIRECT_SUBCOMMANDS@) exec "$real_git" "$@" ;;
@CONDITIONAL_READS@
esac

# A write with no option before the subcommand acts on the repository that the
# working directory (or GIT_DIR) selects. Outside the project it runs directly.
# An option this script does not know stands where the subcommand would be;
# the options after it may name any repository, so noskills decides.
case $subcommand in
  @REMOTE_WRITES@|-*) ;;
  *)
    if [ "$1" = "$subcommand" ]; then
      target_git_dir=$("$real_git" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || target_git_dir=''
      if [ "$target_git_dir" != "$project_git_dir" ]; then
        exec "$real_git" "$@"
      fi
    fi
    ;;
esac

# The command may change directory before noskills starts (deno task does), so
# the working directory git would run in travels as NOSKILLS_GIT_CWD.
git_cwd=$(pwd -P)

# The check may never answer (npx can wait on the registry), so a watcher stops
# it after @TIMEOUT@ seconds: SIGTERM, then SIGKILL @GRACE@ seconds later.
# The check writes to a file rather than to this script's stderr, so a process
# it leaves behind cannot keep the caller's pipe open.
check_log=$(mktemp "${TMPDIR:-/tmp}/noskills-git-check.XXXXXX") || {
  printf '%s\n' "noskills: could not create a temporary file to check \"git $subcommand\", so it did not run." >&2
  exit 1
}
NOSKILLS_REAL_GIT=$real_git NOSKILLS_GIT_CWD=$git_cwd NOSKILLS_PROJECT_ROOT=@PROJECT_ROOT@ @COMMAND_PREFIX@ invoke-hook git-exec "$@" </dev/null >"$check_log" 2>&1 &
check_pid=$!
(
  watch_status=0
  trap 'kill "$nap_pid" 2>/dev/null; exit "$watch_status"' TERM
  sleep @TIMEOUT@ &
  nap_pid=$!
  wait "$nap_pid"
  watch_status=@TIMED_OUT@
  kill -TERM "$check_pid" 2>/dev/null
  sleep @GRACE@ &
  nap_pid=$!
  wait "$nap_pid"
  kill -KILL "$check_pid" 2>/dev/null
  exit @TIMED_OUT@
) </dev/null >/dev/null 2>&1 &
watch_pid=$!
trap 'kill "$check_pid" "$watch_pid" 2>/dev/null; rm -f "$check_log"; exit 1' HUP INT TERM
# The shell's notice for a stopped job would reach the agent; the message below
# says what happened instead.
wait "$check_pid" 2>/dev/null
status=$?
kill "$watch_pid" 2>/dev/null
wait "$watch_pid" 2>/dev/null
watch_status=$?
trap - HUP INT TERM
cat "$check_log" >&2
rm -f "$check_log"

if [ "$status" -ne 0 ]; then
  if [ "$watch_status" -eq @TIMED_OUT@ ]; then
    printf '%s\n' "noskills: the check for \"git $subcommand\" did not answer within @TIMEOUT@ seconds, so it did not run. When command in .eser/manifest.yml starts noskills through npx, install noskills and set command to the installed one, so the check does not wait on the network." >&2
  elif [ "$status" -ne @DENIED@ ]; then
    printf '%s\n' "noskills: could not check \"git $subcommand\" (exit status $status), so it did not run." >&2
  fi
  exit 1
fi
exec "$real_git" "$@"
`

// GitRunner runs the git binary with args in dir. ok is false when git ran
// and exited with an error (not a repository, for one); err is set when git
// could not run at all or did not answer before ctx ended. Tests pass a
// fake.
type GitRunner func(ctx context.Context, git string, args []string, dir string) (stdout string, ok bool, err error)

// WrapperBinDir is the wrapper directory of a project.
func WrapperBinDir(root string) string {
	return root + "/" + WrapperDir
}

func isExecutableFile(path string) bool {
	info, err := os.Stat(path)

	return err == nil && info.Mode().IsRegular() && info.Mode().Perm()&0o111 != 0
}

func realPathOrSelf(path string) string {
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return path
	}

	return resolved
}

// ResolveRealGit returns the first executable git on PATH outside
// excludeDir, or "" when there is none. Relative PATH entries are skipped:
// they resolve against whatever directory the agent is in.
func ResolveRealGit(pathValue, excludeDir string) string {
	excluded := realPathOrSelf(excludeDir)

	for _, dir := range strings.Split(pathValue, ":") {
		if !strings.HasPrefix(dir, "/") {
			continue
		}

		if dir == excludeDir || realPathOrSelf(dir) == excluded {
			continue
		}

		candidate := dir + "/git"
		if isExecutableFile(candidate) {
			return candidate
		}
	}

	return ""
}

// GitCommonDir returns the common git directory that git selects with these
// global options in cwd, or "" when cwd is not in a repository. It fails
// when git cannot run, which the TypeScript check reports as an error too.
func GitCommonDir(ctx context.Context, run GitRunner, realGit string, globalOptions []string, cwd string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, revParseTimeout)
	defer cancel()

	args := append(slices.Clone(globalOptions), "rev-parse", "--path-format=absolute", "--git-common-dir")

	stdout, ok, err := run(ctx, realGit, args, cwd)
	if err != nil {
		return "", fmt.Errorf("run %s rev-parse in %s: %w", realGit, cwd, err)
	}

	if !ok {
		return "", nil
	}

	return jsTrim(stdout), nil
}

// InstallGitWrapperOptions are the inputs of InstallGitWrapper.
type InstallGitWrapperOptions struct {
	Root          string
	CommandPrefix string
	// PathValue is the PATH the real git is looked up on.
	PathValue string
	// GOOS is the platform; the wrapper is a POSIX script, so Windows gets
	// none.
	GOOS string
	Run  GitRunner
	// CheckTimeoutSeconds is passed to BuildWrapperScript.
	CheckTimeoutSeconds int
}

// InstalledGitWrapper is where an installed wrapper is.
type InstalledGitWrapper struct {
	// BinDir holds the git script; it goes first on PATH.
	BinDir string
	// RealGit is the git binary the wrapper runs.
	RealGit string
}

// InstallGitWrapper writes the wrapper for a project and returns where it
// is, or nil when it cannot work here (Windows, or no git on PATH). The
// script is replaced atomically, so a git call running during the rewrite
// never reads half of it.
func InstallGitWrapper(ctx context.Context, opts *InstallGitWrapperOptions) (*InstalledGitWrapper, error) {
	if opts.GOOS == "windows" {
		return nil, nil //nolint:nilnil // nil means "no wrapper here", not an error
	}

	binDir := WrapperBinDir(opts.Root)

	realGit := ResolveRealGit(opts.PathValue, binDir)
	if realGit == "" {
		return nil, nil //nolint:nilnil // no git on PATH: nothing to wrap
	}

	projectGitDir, err := GitCommonDir(ctx, opts.Run, realGit, nil, opts.Root)
	if err != nil {
		return nil, err
	}

	if projectGitDir == "" {
		resolvedRoot, err := filepath.EvalSymlinks(opts.Root)
		if err != nil {
			return nil, fmt.Errorf("resolve the project root %q: %w", opts.Root, err)
		}

		projectGitDir = resolvedRoot + "/.git"
	}

	script, err := BuildWrapperScript(&WrapperScriptOptions{
		RealGit:             realGit,
		ProjectGitDir:       projectGitDir,
		ProjectRoot:         opts.Root,
		CommandPrefix:       opts.CommandPrefix,
		CheckTimeoutSeconds: opts.CheckTimeoutSeconds,
	})
	if err != nil {
		return nil, err
	}

	if err := os.MkdirAll(binDir, 0o750); err != nil {
		return nil, fmt.Errorf("create %s: %w", binDir, err)
	}

	if err := writeExecutableAtomic(binDir+"/git", script); err != nil {
		return nil, err
	}

	return &InstalledGitWrapper{BinDir: binDir, RealGit: realGit}, nil
}

func writeExecutableAtomic(target, content string) error {
	var suffix [16]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return fmt.Errorf("name a temporary file for %s: %w", target, err)
	}

	temp := filepath.Join(filepath.Dir(target), ".git."+hex.EncodeToString(suffix[:])+".tmp")

	err := os.WriteFile(temp, []byte(content), 0o755) //nolint:gosec // G306: the wrapper is a script the shell executes
	if err == nil {
		// The umask may have masked the execute bits at creation.
		err = os.Chmod(temp, 0o755) //nolint:gosec // G302: as above
	}

	if err == nil {
		err = os.Rename(temp, target)
	}

	if err != nil {
		_ = os.Remove(temp)

		return fmt.Errorf("write the git wrapper %s: %w", target, err)
	}

	return nil
}

// ExportFromEnvFile appends the PATH export for binDir to a Claude Code
// CLAUDE_ENV_FILE, unless an earlier SessionStart of the session did.
func ExportFromEnvFile(envFile, binDir string) error {
	line := EnvFileExport(binDir)

	current, err := os.ReadFile(envFile) //nolint:gosec // G304: the file Claude Code names in CLAUDE_ENV_FILE
	if err == nil && strings.Contains(string(current), line) {
		return nil
	}

	f, err := os.OpenFile(envFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644) //nolint:gosec // G302,G304: Claude Code's env file
	if err != nil {
		return fmt.Errorf("open CLAUDE_ENV_FILE %s: %w", envFile, err)
	}

	defer func() { _ = f.Close() }()

	if _, err := f.WriteString(line); err != nil {
		return fmt.Errorf("append to CLAUDE_ENV_FILE %s: %w", envFile, err)
	}

	return nil
}

// GitExecContext is where `invoke-hook git-exec` runs: what the wrapper
// passes it.
type GitExecContext struct {
	Root    string
	RealGit string
	Cwd     string
	Run     GitRunner
}

// CheckGitExec is the check behind the wrapper: the refusal message for a
// git command an agent session may not run, or "" when it may run. allowGit
// comes from the manifest at the time of the call. An error means the
// repository could not be told; the caller refuses the command then.
func CheckGitExec(ctx context.Context, args []string, gc *GitExecContext) (string, error) {
	if ReadHookManifest(gc.Root).AllowGit {
		return "", nil
	}

	switch ClassifyGitExec(args) {
	case GitExecRead, GitExecClone:
		return "", nil
	case GitExecPush:
		return GitExecDenial(args), nil
	case GitExecWrite:
	}

	split := SplitGitArgs(args)
	// An option the guard does not know stands where the subcommand would
	// be; the options after it may name any repository, so it is refused.
	if strings.HasPrefix(split.Subcommand, "-") {
		return GitExecDenial(args), nil
	}

	targetDir, err := GitCommonDir(ctx, gc.Run, gc.RealGit, split.GlobalOptions, gc.Cwd)
	if err != nil {
		return "", err
	}

	projectDir, err := GitCommonDir(ctx, gc.Run, gc.RealGit, nil, gc.Root)
	if err != nil {
		return "", err
	}

	if targetDir != "" && targetDir == projectDir {
		return GitExecDenial(args), nil
	}

	return "", nil
}

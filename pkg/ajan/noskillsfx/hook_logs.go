// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// What the hooks write: the executor reminder flag, the PostToolUse logs and
// one recorded iteration per Stop. Port of the bookkeeping in
// commands/invoke-hook.ts and state/iteration.ts. All of it is best effort:
// a hook that fails would surface to the user as an agent failure.

const (
	executorFlagFile  = "executor-warned.flag"
	filesChangedLog   = "files-changed.jsonl"
	noskillsCallsLog  = "noskills-calls.jsonl"
	iterationsDirName = "iterations"
	gitReadTimeout    = 5 * time.Second
	// stateFilePerm is the mode Node's writeFile gives a new file under the
	// usual umask.
	stateFilePerm = 0o644
)

// ISOTime is Date.prototype.toISOString: UTC with milliseconds.
func ISOTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// AppendProgressLog appends JSON lines to a log under
// .eser/.state/progresses/. Appending, rather than reading the log and
// writing it back, keeps the entries of two hooks that run at once.
func AppendProgressLog(root, fileName string, entries []*JSObject) {
	if len(entries) == 0 {
		return
	}

	dir := filepath.Join(root, progressesDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return
	}

	var b strings.Builder
	for _, entry := range entries {
		b.WriteString(jsonStringify(entry) + "\n")
	}

	f, err := os.OpenFile(filepath.Join(dir, fileName), os.O_APPEND|os.O_CREATE|os.O_WRONLY, stateFilePerm) //nolint:gosec // G302,G304: a log of the project
	if err != nil {
		return
	}

	defer func() { _ = f.Close() }()

	_, _ = f.WriteString(b.String())
}

// FileWriteEntries are the files-changed.jsonl lines for a PostToolUse file
// call: one per named file outside .eser/ and .claude/.
func FileWriteEntries(call ToolCall, tool string, now time.Time) []*JSObject {
	if call.Kind != ToolCallFile {
		return nil
	}

	ts := ISOTime(now)

	var entries []*JSObject

	for _, change := range call.Changes {
		if IsLoggedFileWrite(change.Path) {
			entries = append(entries, JSObjectOf("file", change.Path, "tool", tool, "ts", ts))
		}
	}

	return entries
}

// NoskillsCallEntry is the noskills-calls.jsonl line for a noskills command.
func NoskillsCallEntry(command string, now time.Time) *JSObject {
	return JSObjectOf("command", command, "ts", ISOTime(now))
}

// TakeExecutorReminder returns the executor reminder on the first file edit
// of an iteration and "" on later ones. A flag file records that it was
// shown; the Stop hook removes it when the iteration ends.
func TakeExecutorReminder(root string, now time.Time) string {
	dir := filepath.Join(root, progressesDir)
	flag := filepath.Join(dir, executorFlagFile)

	if _, err := os.Stat(flag); err == nil {
		return ""
	}

	if err := os.MkdirAll(dir, 0o750); err != nil {
		return ""
	}

	// Without the flag the reminder would repeat on every edit, so it is
	// skipped when the flag cannot be written.
	if err := os.WriteFile(flag, []byte(ISOTime(now)), stateFilePerm); err != nil { //nolint:gosec // G306: the mode the TypeScript CLI gives it
		return ""
	}

	return ExecutorReminder
}

// RemoveExecutorReminderFlag resets the reminder for the next iteration.
func RemoveExecutorReminderFlag(root string) {
	_ = os.Remove(filepath.Join(root, progressesDir, executorFlagFile))
}

// IsDriverAuthoritative reports whether `noskills run` has claimed the
// current turn (execution.driver "acp" with a live execution.driverPid), so
// the Stop hook stands down. A claim without a pid is not binding, and a
// dead owner releases it.
func IsDriverAuthoritative(execution *JSObject, isAlive func(pid int) bool) bool {
	if StringField(execution, "driver") != "acp" {
		return false
	}

	owner, _ := execution.get("driverPid")

	pid, ok := owner.(float64)
	if !ok {
		return false
	}

	return isAlive(int(pid))
}

// IterationRecord is what one recorded iteration observed.
type IterationRecord struct {
	// Iteration is a float64 because the TypeScript counter is a JavaScript
	// number: a hand-edited 2.5 becomes 3.5, not 3.
	Iteration     float64
	ModifiedFiles []string
	// GitStat is the `git diff --stat` summary line; "" when the turn changed
	// nothing or git could not be consulted.
	GitStat string
}

// readTrackedFiles returns the files the PostToolUse hook logged for this
// iteration, each once, in the order they were first logged.
func readTrackedFiles(root string) []string {
	data, err := os.ReadFile(filepath.Join(root, progressesDir, filesChangedLog)) //nolint:gosec // G304: the project's own log
	if err != nil {
		return nil
	}

	var files []string

	for _, line := range strings.Split(string(data), "\n") {
		parsed, err := parseJSON(line)
		if err != nil {
			continue
		}

		entry, ok := parsed.(*JSObject)
		if !ok {
			continue
		}

		if file := StringField(entry, "file"); file != "" && !slices.Contains(files, file) {
			files = append(files, file)
		}
	}

	return files
}

// readGitChanges reads what git thinks changed. Both are empty, not a
// "no changes" text, when git cannot be consulted, so the previous progress
// note is kept.
func readGitChanges(ctx context.Context, run GitRunner, git, root string) (files []string, stat string) {
	var (
		wg               sync.WaitGroup
		diff, statOutput string
		diffOK, statOK   bool
	)

	readGit := func(args []string, out *string, ok *bool) {
		defer wg.Done()

		gitCtx, cancel := context.WithTimeout(ctx, gitReadTimeout)
		defer cancel()

		// A git that cannot run counts as no answer, as a failing one does.
		*out, *ok, _ = run(gitCtx, git, args, root)
	}

	wg.Add(2)

	go readGit([]string{"diff", "--name-only"}, &diff, &diffOK)
	go readGit([]string{"diff", "--stat"}, &statOutput, &statOK)

	wg.Wait()

	if !diffOK || !statOK {
		return nil, ""
	}

	for _, file := range strings.Split(jsTrim(diff), "\n") {
		if file != "" {
			files = append(files, file)
		}
	}

	lines := strings.Split(jsTrim(statOutput), "\n")

	return files, lines[len(lines)-1]
}

// errNoState means state.json could not be read, so nothing is recorded.
var errNoState = errors.New("state.json cannot be read")

// RecordIteration records one completed iteration: it bumps
// execution.iteration, captures what changed, writes the per-iteration log
// and clears the tracking log for the next turn. It returns errNoState when
// state.json cannot be read, the quiet "do nothing" the Stop hook has always
// done. The state keeps every field and its order.
func RecordIteration(ctx context.Context, root string, run GitRunner, git string, now time.Time) (*IterationRecord, error) {
	statePath := filepath.Join(root, stateFile)

	data, err := os.ReadFile(statePath) //nolint:gosec // G304: the project's own state
	if err != nil {
		return nil, errNoState
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		return nil, errNoState
	}

	state, ok := parsed.(*JSObject)
	if !ok {
		return nil, errNoState
	}

	execution, _ := fieldObject(state, "execution")

	tracked := readTrackedFiles(root)
	gitFiles, gitStat := readGitChanges(ctx, run, git, root)

	modified := []string{}
	for _, file := range append(tracked, gitFiles...) {
		if !slices.Contains(modified, file) {
			modified = append(modified, file)
		}
	}

	previous := 0.0
	if value, ok := execution.get("iteration"); ok {
		previous, _ = value.(float64)
	}

	iteration := previous + 1
	gitStat = jsTrim(gitStat)

	writeIterationLog(root, iteration, modified, gitStat, now)

	var previousProgress any
	if stored := StringField(execution, "lastProgress"); stored != "" {
		previousProgress = stored
	}

	updated := execution.clone()
	updated.set("iteration", iteration)
	updated.set("modifiedFiles", toAnySlice(modified))

	// An empty stat means the turn changed nothing; the previous progress
	// note stays, so the next prompt still carries the last real change.
	if gitStat != "" {
		updated.set("lastProgress", gitStat)
	} else {
		updated.set("lastProgress", previousProgress)
	}

	state.set("execution", updated)
	state.set("lastCalledAt", ISOTime(now))

	// The rewrite keeps the file's mode, as writing over it in place does.
	mode := os.FileMode(stateFilePerm)
	if info, err := os.Stat(statePath); err == nil {
		mode = info.Mode().Perm()
	}

	_ = writeFileAtomic(statePath, []byte(jsonStringifyIndent(state)+"\n"), mode)

	// The tracking log starts empty for the next iteration.
	_ = os.WriteFile(filepath.Join(root, progressesDir, filesChangedLog), nil, stateFilePerm) //nolint:gosec // G306: the mode the TypeScript CLI gives it

	return &IterationRecord{Iteration: iteration, ModifiedFiles: modified, GitStat: gitStat}, nil
}

func writeIterationLog(root string, iteration float64, files []string, gitStat string, now time.Time) {
	dir := filepath.Join(root, progressesDir, iterationsDirName)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return
	}

	entry := JSObjectOf(
		"iteration", iteration,
		"files", toAnySlice(files),
		"gitStat", gitStat,
		"timestamp", ISOTime(now),
	)

	name := "iteration-" + jsNumberString(iteration) + ".json"
	_ = os.WriteFile(filepath.Join(dir, name), []byte(jsonStringifyIndent(entry)+"\n"), stateFilePerm) //nolint:gosec // G306: as above
}

func toAnySlice(items []string) []any {
	out := make([]any, len(items))
	for i, item := range items {
		out[i] = item
	}

	return out
}

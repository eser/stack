// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package golden

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"
)

// The scenarios of TASK-259.1: sessions, the user identity with the config
// command, and the diagram registry. Every step runs in Go at replay time.

const sessionsDir = ".eser/.state/sessions"

// generatedSessionName is the file name of a session `session start`
// made: 8 random hex characters. The fixed sessions the steps write use
// other names.
var generatedSessionName = regexp.MustCompile(`^[0-9a-f]{8}\.json$`) //nolint:gochecknoglobals // compiled once

// addSessionIDs maps each generated session id found after a step to a
// numbered placeholder, in the order the steps made them, so two runs
// record the same text.
func addSessionIDs(t *testing.T, project string, replacements map[string]string) {
	t.Helper()

	entries, err := os.ReadDir(filepath.Join(project, filepath.FromSlash(sessionsDir)))
	if err != nil {
		return
	}

	var fresh []string

	for _, entry := range entries {
		id := strings.TrimSuffix(entry.Name(), ".json")
		if _, known := replacements[id]; !known && generatedSessionName.MatchString(entry.Name()) {
			fresh = append(fresh, id)
		}
	}

	if len(fresh) > 1 {
		t.Fatalf("one step made %d sessions; the placeholders would depend on their random ids", len(fresh))
	}

	for _, id := range fresh {
		count := 0

		for _, placeholder := range replacements {
			if strings.HasPrefix(placeholder, "<SESSION_") {
				count++
			}
		}

		replacements[id] = "<SESSION_" + strconv.Itoa(count+1) + ">"
	}
}

// dropGeneratedSessions removes the sessions `session start` made, so a
// later listing does not order random ids.
func dropGeneratedSessions(t *testing.T, project string) {
	t.Helper()

	dir := filepath.Join(project, filepath.FromSlash(sessionsDir))

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}

	for _, entry := range entries {
		if generatedSessionName.MatchString(entry.Name()) {
			if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func isoAgo(d time.Duration) string {
	return time.Now().Add(-d).UTC().Format("2006-01-02T15:04:05.000Z")
}

// writeFixedSessions drops the generated sessions and writes sessions
// whose lastActiveAt is relative to now: a fresh one, a stale one, one
// with an unreadable time, and two files the listing skips.
func writeFixedSessions(t *testing.T, project string) {
	t.Helper()

	dropGeneratedSessions(t, project)

	files := map[string]string{
		"sess-fresh.json": `{"id":"sess-fresh","spec":"add-login-page","mode":"spec","phase":"DISCOVERY","pid":4242,` +
			`"startedAt":"2020-01-01T00:00:00.000Z","lastActiveAt":"` + isoAgo(5*time.Minute+10*time.Second) + `","tool":"kiro"}`,
		"sess-old.json": `{"id":"sess-old","spec":null,"mode":"free","phase":null,"pid":0,"startedAt":"` + isoAgo(4*time.Hour) +
			`","lastActiveAt":"` + isoAgo(3*time.Hour+30*time.Minute) + `","tool":"claude-code"}`,
		"sess-bad.json":   `{"id":"sess-bad","mode":"free","lastActiveAt":"not a date","tool":"claude-code"}`,
		"sess-other.json": `{"id":"someone-else","mode":"free","lastActiveAt":"` + isoAgo(time.Minute) + `"}`,
		"bad.name.json":   `{"id":"bad.name","mode":"free"}`,
	}

	for name, content := range files {
		writeProjectFile(t, project, sessionsDir+"/"+name, content+"\n")
	}
}

// sessionSteps cover session start in each mode, list, end, gc and the
// session phase that next writes.
func sessionSteps() []step {
	session := func(args ...string) []string { return append([]string{"session"}, args...) }

	return []step{
		{Args: session()},
		{Args: session("start", "--free")},
		{Args: session("list")},
		{Args: session("gc")},
		{Args: []string{"init", "--non-interactive"}, Env: fixedTools()},
		// 5: the starts
		{Args: session("start")},
		{Args: session("start", "--spec=nope")},
		{Args: session("start", "--free")},
		{Args: session("list")},
		{Args: session("start", "--auto"), Before: dropGeneratedSessions},
		{Args: []string{"spec", "new", "add a login page"}, Before: dropGeneratedSessions},
		{Args: session("start", "--spec=add-login-page")},
		{Args: session("start", "--auto"), Before: dropGeneratedSessions},
		{Args: session("start", "--spec=add-login-page", "--free"), Before: dropGeneratedSessions},
		{Args: session("start", "--spec="), Before: dropGeneratedSessions},
		// 15: listing, the phase next writes, end and gc
		{Args: session("list"), Before: writeFixedSessions},
		{Args: []string{"spec", "add-login-page", "next"}, Env: map[string]string{"NOSKILLS_SESSION": "sess-fresh"}},
		{Args: session("end"), Env: map[string]string{"NOSKILLS_SESSION": "sess-fresh"}},
		{Args: session("end", "--id=sess-fresh")},
		{Args: session("end", "--id=../sess-old")},
		{Args: session("end", "--id=")},
		{Args: session("end")},
		{Args: session("gc")},
		{Args: session("gc")},
		{Args: session("list")},
		{Args: session("free")},
	}
}

// homeFile writes a file under the fixture's home directory.
func homeFile(rel, content string) func(t *testing.T, project string) {
	return func(t *testing.T, project string) {
		t.Helper()

		path := filepath.Join(filepath.Dir(project), "home", filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
}

// gitIdentity sets user.name and user.email in the fixture's repository.
func gitIdentity(name, email string) func(t *testing.T, project string) {
	return func(t *testing.T, project string) {
		t.Helper()

		for _, kv := range [][2]string{{"user.name", name}, {"user.email", email}} {
			cmd := exec.Command("git", "config", kv[0], kv[1]) //nolint:noctx // a local git config write
			cmd.Dir = project

			if out, err := cmd.CombinedOutput(); err != nil {
				t.Fatalf("git config %s: %v: %s", kv[0], err, out)
			}
		}
	}
}

// identitySteps cover config set-user, get-user and clear-user, the git
// fallback, XDG_CONFIG_HOME, and the user that answers, transitions and
// spec creation record.
func identitySteps() []step {
	config := func(args ...string) []string { return append([]string{"config"}, args...) }
	next := func(args ...string) []string { return append([]string{"spec", "add-login-page", "next"}, args...) }
	userFile := ".config/eser/noskills/user.json"
	xdg := map[string]string{"XDG_CONFIG_HOME": "<HOME>/xdg"}

	return []step{
		{Args: config()},
		{Args: config("get-user")},
		{Args: config("set-user")},
		{Args: config("set-user", "--email=ada@example.com")},
		{Args: config("set-user", "--from-git")},
		{Args: config("set-user", "--name=Ada Lovelace", "--email=ada@example.com")},
		{Args: config("get-user")},
		// 7: the configured user in a spec
		{Args: []string{"init", "--non-interactive"}, Env: fixedTools()},
		{Args: []string{"spec", "new", "add a login page"}},
		{Args: next("--answer=Users sign in with an email and a password")},
		{Args: next("--answer=validate")},
		{Args: next("--answer=" + premisesAnswer)},
		{Args: next("--answer=" + partialAnswers)},
		// 13: clearing, the git fallback and malformed files
		{Args: config("clear-user")},
		{Args: config("clear-user")},
		{Args: config("set-user", "--from-git", "--name=Ignored"), Before: gitIdentity("Grace Hopper", "grace@example.com")},
		{Args: config("get-user")},
		{Args: config("clear-user")},
		{Args: []string{"spec", "new", "--name=export-reports", "export the weekly reports"}},
		{Args: []string{"spec", "export-reports", "next", "--answer=Reports go out as CSV every Monday morning"}},
		{Args: config("get-user"), Before: homeFile(userFile, `{"name":"","email":"x@example.com"}`)},
		{Args: config("get-user"), Before: homeFile(userFile, `{"name":"Bob","email":null}`)},
		{Args: config("get-user"), Before: homeFile(userFile, `not json`)},
		{Args: config("clear-user")},
		// 24: XDG_CONFIG_HOME
		{Args: config("set-user", "--name=Xavier"), Env: xdg},
		{Args: config("get-user"), Env: xdg},
		{Args: config("get-user")},
		{Args: config("clear-user"), Env: xdg},
	}
}

const (
	readmeDiagram = "# Fixture\n\n```mermaid\ngraph TD\n  A[src/login.ts] --> B[dashboard/state]\n" +
		"  B --> C[@eserstack/noskills]\n  A --> D[src/login.ts]\n```\n\nSome text.\n"
	asciiDiagram = "# Architecture\n\n┌──────────┐    ┌──────────┐\n│ main.go  │───▶│ store.go │\n" +
		"└──────────┘    └──────────┘\n\n| a | b |\n|---|---|\n"
	nestedDiagram = "Intro\n  ```mermaid\nsequenceDiagram\n  pkg/@eserstack/noskills/main.ts->>api/client: call\n  ```\n"
	brokenDiagram = "```mermaid\ngraph LR\n  never/closed.md --> x\n"
	pumlDiagram   = "@startuml\nAlice -> Bob: api/client.py\n@enduml\n"
)

// diagramFiles are the fixture's diagrams, including ones the scan skips.
func diagramFiles() map[string]string {
	return map[string]string{
		"README.md":                  readmeDiagram,
		"docs/arch.md":               asciiDiagram,
		"docs/nested/deep.md":        nestedDiagram,
		"docs/broken.md":             brokenDiagram,
		"arch.puml":                  pumlDiagram,
		"node_modules/pkg/README.md": readmeDiagram,
		".hidden/notes.md":           readmeDiagram,
	}
}

// diagramSteps cover diagrams scan, list, check and verify, and the stale
// diagrams COMPLETED reports.
func diagramSteps() []step {
	diagrams := func(args ...string) []string { return append([]string{"diagrams"}, args...) }
	modified := func(rel string) func(t *testing.T, project string) {
		return replaceInFile(rel, `"modifiedFiles": []`, `"modifiedFiles": ["./src/login.ts", "docs/store.go"]`)
	}
	completed := func(t *testing.T, project string) {
		t.Helper()

		replaceInFile(specStatePath, `"phase": "DISCOVERY"`, `"phase": "COMPLETED"`)(t, project)
		modified(specStatePath)(t, project)
	}

	return []step{
		{Args: diagrams("scan")},
		{Args: diagrams("list")},
		{Args: []string{"init", "--non-interactive"}, Env: fixedTools()},
		{Args: diagrams()},
		{Args: diagrams("check")},
		// 5: a scan of the fixture's diagrams
		{Args: diagrams("scan"), Write: diagramFiles()},
		{Args: diagrams("list")},
		{Args: diagrams("check")},
		{Args: diagrams("check"), Before: modified(globalState)},
		// 9: verify
		{Args: diagrams("verify")},
		{Args: diagrams("verify", "docs/arch.md", "--line=x")},
		{Args: diagrams("verify", "docs/arch.md", "--line=99")},
		{Args: diagrams("verify", "docs/arch.md", "--line=3")},
		{Args: diagrams("verify", "arch.puml")},
		{Args: diagrams("verify", "nope.md")},
		{Args: diagrams("bogus")},
		// 16: a completed spec that touched a diagram's file
		{Args: []string{"spec", "new", "add a login page"}},
		{Args: []string{"spec", "add-login-page", "next"}, Before: completed},
		{Args: diagrams("list")},
	}
}

func sessionScenarios() []scenario {
	return []scenario{
		{name: "sessions", steps: sessionSteps(), nativeFrom: 0, portedBy: "TASK-259.1", delta: true},
		{name: "user_identity", steps: identitySteps(), nativeFrom: 0, portedBy: "TASK-259.1", delta: true},
		{name: "diagrams", steps: diagramSteps(), nativeFrom: 0, portedBy: "TASK-259.1", delta: true},
	}
}

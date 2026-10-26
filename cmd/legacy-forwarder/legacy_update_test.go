// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// legacyRelease is the version of the local release; any version above the
// fixtures' 4.5.2 is an update for them.
const legacyRelease = "5.0.0"

// minNodeMajor and minNodeMinor are the oldest Node that runs the
// workspace's TypeScript as it is, the engines field of the root
// package.json (>=26.9).
const (
	minNodeMajor = 26
	minNodeMinor = 9
)

// TestLegacyBinariesSelfUpdate is the legacy-update preflight (TASK-253,
// TASK-261, decision-9): `eser dev compile` builds the laroux stub and the
// Go noskills for the host, a local server serves them as release v5.0.0,
// and the TypeScript updater that installed v4.5.x binaries run
// (testdata/legacy_update.ts around update.ts) updates a v4.5.2 laroux and
// noskills fixture from it, checksum included. The laroux fixture must then
// be the stub and run the npm package through npx; the noskills fixture must
// be the Go noskills. Nothing leaves the machine: the harness fails any URL
// it does not send to the local server, and npx is a fake.
//
// It needs Node 26.9 or later on PATH, which runs update.ts, and the
// workspace's installed node_modules; without them it is skipped, unless
// ESER_PREFLIGHT is set, as the preflight workflow does.
func TestLegacyBinariesSelfUpdate(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("update.ts leaves a .new.exe on Windows for the user to rename")
	}

	if testing.Short() {
		t.Skip("builds the release binaries and runs node")
	}

	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}

	node, err := updaterNode(root)
	if err != nil {
		if os.Getenv("ESER_PREFLIGHT") != "" {
			t.Fatalf("%v; the legacy-update preflight runs update.ts on it", err)
		}

		t.Skipf("%v; it runs the old update.ts", err)
	}

	host, err := codebasefx.HostReleaseTarget(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		t.Skip(err)
	}

	legacy := make(map[string]codebasefx.ReleaseBinary, 2) //nolint:mnd // laroux and noskills
	for _, binary := range codebasefx.ReleaseBinaries {
		if binary.Name == "laroux" || binary.Name == "noskills" {
			legacy[binary.Name] = binary
		}
	}

	if legacy["laroux"].Main != "./cmd/legacy-forwarder" || legacy["noskills"].Main != "./cmd/noskills" {
		t.Fatalf("ReleaseBinaries builds laroux from %q and noskills from %q, want the stub and cmd/noskills",
			legacy["laroux"].Main, legacy["noskills"].Main)
	}

	downloads := t.TempDir()

	result, err := codebasefx.CompileRelease(t.Context(), &codebasefx.CompileOptions{ //nolint:exhaustruct // the real go build
		Root:     root,
		OutDir:   filepath.Join(downloads, "v"+legacyRelease),
		Version:  legacyRelease,
		Targets:  []codebasefx.ReleaseTarget{host},
		Binaries: []codebasefx.ReleaseBinary{legacy["laroux"], legacy["noskills"]},
	})
	if err != nil || len(result.Failed) > 0 {
		t.Fatalf("compile laroux and noskills: %v %v", err, result)
	}

	server := httptest.NewServer(localRelease(downloads))
	t.Cleanup(server.Close)

	for _, binary := range []codebasefx.ReleaseBinary{legacy["laroux"], legacy["noskills"]} {
		t.Run(binary.Name, func(t *testing.T) {
			t.Parallel()

			fixture := filepath.Join(t.TempDir(), binary.Name)
			if err := os.WriteFile(fixture, []byte("#!/bin/sh\necho "+binary.Name+" 4.5.2\n"), 0o755); err != nil { //nolint:gosec // G306: an executable
				t.Fatal(err)
			}

			out := runOldUpdater(t, node, root, server.URL, fixture, binary.Name)

			archive := codebasefx.ArchiveFileName(binary.Name, legacyRelease, host)
			for _, want := range []string{"Downloading " + archive + "...", "Checksum verified.", "Updated to v" + legacyRelease + "!"} {
				if !strings.Contains(out, want) {
					t.Errorf("the update output should contain %q:\n%s", want, out)
				}
			}

			version, err := exec.Command(fixture, "version").CombinedOutput() //nolint:gosec,noctx // the installed binary
			if err != nil || !strings.HasPrefix(string(version), binary.Name+" "+legacyRelease+"\n") {
				t.Fatalf("the fixture is not the v%s %s after the update: %v\n%s", legacyRelease, binary.Name, err, version)
			}

			if binary.Name == "noskills" {
				assertGoNoskills(t, fixture)
			} else {
				assertForwardsToNpx(t, fixture, binary.Name)
			}
		})
	}
}

// assertGoNoskills checks that the updated fixture is cmd/noskills: its JSON
// version names the Go runtime, and it answers a hook itself.
func assertGoNoskills(t *testing.T, fixture string) {
	t.Helper()

	out, err := exec.Command(fixture, "version", "--json").CombinedOutput() //nolint:gosec,noctx // the installed binary
	if err != nil || !strings.Contains(string(out), `"runtime": "go"`) || !strings.Contains(string(out), `"version": "`+legacyRelease+`"`) {
		t.Fatalf("noskills version --json: %v\n%s", err, out)
	}

	hook := exec.Command(fixture, "invoke-hook", "unknown-event") //nolint:gosec,noctx // the installed binary
	hook.Dir = t.TempDir()
	hook.Env = []string{"PATH=" + t.TempDir(), "NOSKILLS_NO_FORWARD=1"}

	if output, err := hook.CombinedOutput(); err != nil {
		t.Errorf("the Go noskills did not answer a hook itself: %v\n%s", err, output)
	}
}

// assertForwardsToNpx checks that the updated fixture is the stub: it runs
// the npm package through npx.
func assertForwardsToNpx(t *testing.T, fixture, name string) {
	t.Helper()

	npxDir := t.TempDir()
	installFakeNpx(t, npxDir)

	record := filepath.Join(t.TempDir(), "record")
	run := exec.Command(fixture, "init", "--yes") //nolint:gosec,noctx // the installed stub
	run.Env = []string{"PATH=" + npxDir, fakeNpxRecord + "=" + record, fakeNpxExit + "=0"}

	if output, err := run.CombinedOutput(); err != nil {
		t.Fatalf("the stub did not forward: %v\n%s", err, output)
	}

	data, _ := os.ReadFile(record) //nolint:gosec // the test's own file
	if want := "guard=" + name + "\n--yes\n" + name + "@" + legacyRelease + "\ninit\n--yes"; string(data) != want {
		t.Errorf("npx ran with %q, want %q", data, want)
	}
}

// localRelease serves GitHub's latest-release endpoint and the release
// downloads from dir/<tag>/, at the paths the harness maps them to.
func localRelease(dir string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /repos/eser/stack/releases/latest", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"tag_name":"v` + legacyRelease + `"}`))
	})
	mux.Handle("GET /eser/stack/releases/download/",
		http.StripPrefix("/eser/stack/releases/download/", http.FileServer(http.Dir(dir))))

	return mux
}

// updaterNode is the node on PATH that runs testdata/legacy_update.ts: Node
// strips the types of the workspace's .ts files from 26.9 on, and update.ts
// resolves its @eserstack imports through the installed node_modules.
func updaterNode(root string) (string, error) {
	node, err := exec.LookPath("node")
	if err != nil {
		return "", fmt.Errorf("node is not on PATH: %w", err)
	}

	out, err := exec.Command(node, "--version").Output() //nolint:gosec,noctx // node from PATH with a fixed argument
	if err != nil {
		return "", fmt.Errorf("%s --version: %w", node, err)
	}

	version := strings.TrimSpace(string(out))
	majorText, rest, _ := strings.Cut(strings.TrimPrefix(version, "v"), ".")
	minorText, _, _ := strings.Cut(rest, ".")
	major, majorErr := strconv.Atoi(majorText)
	minor, minorErr := strconv.Atoi(minorText)

	if majorErr != nil || minorErr != nil {
		return "", fmt.Errorf("%s --version printed %q, not a version", node, version)
	}

	if major < minNodeMajor || (major == minNodeMajor && minor < minNodeMinor) {
		return "", fmt.Errorf("%s is %s, want node %d.%d or later", node, version, minNodeMajor, minNodeMinor)
	}

	if _, err := os.Stat(filepath.Join(root, "node_modules")); err != nil {
		return "", fmt.Errorf("the workspace's dependencies are not installed (run pnpm install): %w", err)
	}

	return node, nil
}

// runOldUpdater runs testdata/legacy_update.ts for the fixture under node and
// returns its output. HOME is fresh, so update.ts's version cache is empty.
func runOldUpdater(t *testing.T, node, root, server, fixture, command string) string {
	t.Helper()

	cmd := exec.CommandContext(t.Context(), node, //nolint:gosec // G204: node from PATH with a fixed script
		filepath.Join("cmd", "legacy-forwarder", "testdata", "legacy_update.ts"))
	cmd.Dir = root
	cmd.Env = append(os.Environ(),
		"HOME="+t.TempDir(),
		"NO_COLOR=1",
		"LEGACY_UPDATE_SERVER="+server,
		"LEGACY_UPDATE_BINARY="+fixture,
		"LEGACY_UPDATE_COMMAND="+command,
		"LEGACY_UPDATE_VERSION=4.5.2",
	)

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("the old updater failed: %v\n%s", err, out)
	}

	return string(out)
}

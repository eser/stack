// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// legacyRelease is the version of the local release; any version above the
// fixtures' 4.5.2 is an update for them.
const legacyRelease = "5.0.0"

// TestLegacyBinariesUpdateToTheStubs is the legacy-update preflight
// (TASK-253, decision-9): `eser dev compile` builds the laroux and noskills
// stubs for the host, a local server serves them as release v5.0.0, and the
// TypeScript updater that installed v4.5.x binaries run
// (testdata/legacy_update.ts around update.ts) updates a v4.5.2 laroux and
// noskills fixture from it, checksum included. The installed stub must then
// run the npm package through npx. Nothing leaves the machine: the harness
// fails any URL it does not send to the local server, and npx is a fake.
//
// It needs deno, which runs update.ts; without deno it is skipped, unless
// ESER_PREFLIGHT is set, as the preflight workflow does.
func TestLegacyBinariesUpdateToTheStubs(t *testing.T) {
	t.Parallel()

	if runtime.GOOS == "windows" {
		t.Skip("update.ts leaves a .new.exe on Windows for the user to rename")
	}

	if testing.Short() {
		t.Skip("builds the stubs and runs deno")
	}

	deno, err := exec.LookPath("deno")
	if err != nil {
		if os.Getenv("ESER_PREFLIGHT") != "" {
			t.Fatal("deno is not on PATH; the legacy-update preflight runs update.ts on it")
		}

		t.Skip("deno is not on PATH; it runs the old update.ts")
	}

	host, err := codebasefx.HostReleaseTarget(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		t.Skip(err)
	}

	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}

	stubs := make([]codebasefx.ReleaseBinary, 0, 2) //nolint:mnd // laroux and noskills
	for _, binary := range codebasefx.ReleaseBinaries {
		if binary.Main == "./cmd/legacy-forwarder" {
			stubs = append(stubs, binary)
		}
	}

	if len(stubs) != 2 { //nolint:mnd // laroux and noskills
		t.Fatalf("ReleaseBinaries has %d forwarding stubs, want laroux and noskills", len(stubs))
	}

	downloads := t.TempDir()

	result, err := codebasefx.CompileRelease(t.Context(), &codebasefx.CompileOptions{ //nolint:exhaustruct // the real go build
		Root:     root,
		OutDir:   filepath.Join(downloads, "v"+legacyRelease),
		Version:  legacyRelease,
		Targets:  []codebasefx.ReleaseTarget{host},
		Binaries: stubs,
	})
	if err != nil || len(result.Failed) > 0 {
		t.Fatalf("compile the stubs: %v %v", err, result)
	}

	server := httptest.NewServer(localRelease(downloads))
	t.Cleanup(server.Close)

	for _, stub := range stubs {
		t.Run(stub.Name, func(t *testing.T) {
			t.Parallel()

			fixture := filepath.Join(t.TempDir(), stub.Name)
			if err := os.WriteFile(fixture, []byte("#!/bin/sh\necho "+stub.Name+" 4.5.2\n"), 0o755); err != nil { //nolint:gosec // G306: an executable
				t.Fatal(err)
			}

			out := runOldUpdater(t, deno, root, server.URL, fixture, stub.Name)

			archive := codebasefx.ArchiveFileName(stub.Name, legacyRelease, host)
			for _, want := range []string{"Downloading " + archive + "...", "Checksum verified.", "Updated to v" + legacyRelease + "!"} {
				if !strings.Contains(out, want) {
					t.Errorf("the update output should contain %q:\n%s", want, out)
				}
			}

			version, err := exec.Command(fixture, "version").CombinedOutput() //nolint:gosec,noctx // the installed stub
			if err != nil || !strings.HasPrefix(string(version), stub.Name+" "+legacyRelease+"\n") {
				t.Fatalf("the fixture is not the stub after the update: %v\n%s", err, version)
			}

			npxDir := t.TempDir()
			installFakeNpx(t, npxDir)

			record := filepath.Join(t.TempDir(), "record")
			run := exec.Command(fixture, "init", "--yes") //nolint:gosec,noctx // the installed stub
			run.Env = []string{"PATH=" + npxDir, fakeNpxRecord + "=" + record, fakeNpxExit + "=0"}

			if output, err := run.CombinedOutput(); err != nil {
				t.Fatalf("the stub did not forward: %v\n%s", err, output)
			}

			data, _ := os.ReadFile(record) //nolint:gosec // the test's own file
			if want := "guard=" + stub.Name + "\n--yes\n" + stub.Name + "@" + legacyRelease + "\ninit\n--yes"; string(data) != want {
				t.Errorf("npx ran with %q, want %q", data, want)
			}
		})
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

// runOldUpdater runs testdata/legacy_update.ts for the fixture and returns
// its output. HOME is fresh, so update.ts's version cache is empty; the deno
// cache stays where it was.
func runOldUpdater(t *testing.T, deno, root, server, fixture, command string) string {
	t.Helper()

	env := os.Environ()
	if os.Getenv("DENO_DIR") == "" {
		if cache, err := os.UserCacheDir(); err == nil {
			env = append(env, "DENO_DIR="+filepath.Join(cache, "deno"))
		}
	}

	cmd := exec.CommandContext(t.Context(), deno, "run", "--allow-all", "--no-prompt", //nolint:gosec // G204: deno from PATH with fixed arguments
		filepath.Join("cmd", "legacy-forwarder", "testdata", "legacy_update.ts"))
	cmd.Dir = root
	env = append(env,
		"HOME="+t.TempDir(),
		"NO_COLOR=1",
		"DENO_NO_UPDATE_CHECK=1",
		"LEGACY_UPDATE_SERVER="+server,
		"LEGACY_UPDATE_BINARY="+fixture,
		"LEGACY_UPDATE_COMMAND="+command,
		"LEGACY_UPDATE_VERSION=4.5.2",
	)
	cmd.Env = env

	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("the old updater failed: %v\n%s", err, out)
	}

	return string(out)
}

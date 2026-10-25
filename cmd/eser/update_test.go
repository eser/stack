// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// tarGz builds a tar.gz holding one file.
func tarGz(t *testing.T, name string, content []byte) []byte {
	t.Helper()

	var buf bytes.Buffer

	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)

	if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o755, Size: int64(len(content)), Typeflag: tar.TypeReg}); err != nil { //nolint:exhaustruct
		t.Fatal(err)
	}

	if _, err := tw.Write(content); err != nil {
		t.Fatal(err)
	}

	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}

	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}

	return buf.Bytes()
}

type releaseFixture struct {
	archive []byte
	sums    string // "" serves no SHA256SUMS.txt
	missing bool   // the archive answers 404
}

// serveRelease serves a v4.5.2 release for linux-amd64.
func serveRelease(t *testing.T, fx releaseFixture) (*httptest.Server, string) {
	t.Helper()

	name, err := archiveName("4.5.2", "linux", "amd64")
	if err != nil {
		t.Fatal(err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/latest", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = fmt.Fprint(w, `{"tag_name":"v4.5.2"}`)
	})
	mux.HandleFunc("/download/v4.5.2/"+name, func(w http.ResponseWriter, _ *http.Request) {
		if fx.missing {
			http.NotFound(w, nil)

			return
		}

		_, _ = w.Write(fx.archive)
	})
	mux.HandleFunc("/download/v4.5.2/SHA256SUMS.txt", func(w http.ResponseWriter, _ *http.Request) {
		if fx.sums == "" {
			http.NotFound(w, nil)

			return
		}

		_, _ = fmt.Fprint(w, fx.sums)
	})

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	return server, name
}

// updateEnv is an env whose running binary is a temporary file.
func updateEnv(t *testing.T, server *httptest.Server) (*env, string, *bytes.Buffer) {
	t.Helper()

	self := filepath.Join(t.TempDir(), "eser")
	if err := os.WriteFile(self, []byte("old binary"), 0o755); err != nil { //nolint:gosec // G306: a fake executable
		t.Fatal(err)
	}

	var out bytes.Buffer

	e := testEnv(t)
	e.stdout = &out
	e.version = "4.5.1"
	e.goos, e.goarch = "linux", "amd64"
	e.executable = func() (string, error) { return self, nil }
	e.httpClient = server.Client()
	e.releases = releaseEndpoints{latest: server.URL + "/latest", download: server.URL + "/download"}

	return e, self, &out
}

func sha(data []byte) string {
	sum := sha256.Sum256(data)

	return hex.EncodeToString(sum[:])
}

func TestSelfUpdate(t *testing.T) {
	t.Parallel()

	newBinary := []byte("new binary v4.5.2")
	archive := tarGz(t, "eser", newBinary)

	t.Run("a valid archive replaces the binary", func(t *testing.T) {
		t.Parallel()

		name, _ := archiveName("4.5.2", "linux", "amd64")
		server, _ := serveRelease(t, releaseFixture{archive: archive, sums: sha(archive) + "  " + name + "\n"}) //nolint:exhaustruct
		e, self, out := updateEnv(t, server)

		if err := selfUpdate(context.Background(), e); err != nil {
			t.Fatal(err)
		}

		got, _ := os.ReadFile(self) //nolint:gosec // G304: the test's own file
		if !bytes.Equal(got, newBinary) {
			t.Errorf("binary %q, want %q", got, newBinary)
		}

		if !strings.Contains(out.String(), "Checksum verified.") || !strings.Contains(out.String(), "Updated eser 4.5.1 to 4.5.2.") {
			t.Errorf("output: %s", out)
		}
	})

	t.Run("a checksum mismatch refuses the update", func(t *testing.T) {
		t.Parallel()

		name, _ := archiveName("4.5.2", "linux", "amd64")
		server, _ := serveRelease(t, releaseFixture{archive: archive, sums: strings.Repeat("0", 64) + "  " + name + "\n"}) //nolint:exhaustruct
		e, self, _ := updateEnv(t, server)

		err := selfUpdate(context.Background(), e)
		if !errors.Is(err, errChecksum) || !strings.Contains(err.Error(), "refusing to install") {
			t.Fatalf("expected a checksum refusal, got %v", err)
		}

		if got, _ := os.ReadFile(self); string(got) != "old binary" { //nolint:gosec // G304: the test's own file
			t.Errorf("the binary changed: %q", got)
		}
	})

	t.Run("a missing archive fails with an npm pointer", func(t *testing.T) {
		t.Parallel()

		server, name := serveRelease(t, releaseFixture{missing: true}) //nolint:exhaustruct
		e, _, _ := updateEnv(t, server)

		err := selfUpdate(context.Background(), e)
		if !errors.Is(err, errMissingArchive) || !strings.Contains(err.Error(), "npm install -g eser") ||
			!strings.Contains(err.Error(), "Release v4.5.2 has no "+name) {
			t.Fatalf("expected the missing-archive message, got %v", err)
		}
	})

	t.Run("a missing SHA256SUMS.txt fails closed", func(t *testing.T) {
		t.Parallel()

		server, _ := serveRelease(t, releaseFixture{archive: archive}) //nolint:exhaustruct
		e, self, _ := updateEnv(t, server)

		if err := selfUpdate(context.Background(), e); !errors.Is(err, errChecksum) {
			t.Fatalf("expected a refusal, got %v", err)
		}

		if got, _ := os.ReadFile(self); string(got) != "old binary" { //nolint:gosec // G304: the test's own file
			t.Errorf("the binary changed: %q", got)
		}
	})

	t.Run("an up-to-date binary does nothing", func(t *testing.T) {
		t.Parallel()

		server, _ := serveRelease(t, releaseFixture{archive: archive}) //nolint:exhaustruct
		e, _, out := updateEnv(t, server)
		e.version = "4.5.2"

		if err := selfUpdate(context.Background(), e); err != nil || !strings.Contains(out.String(), "is the latest version") {
			t.Errorf("err %v, output %s", err, out)
		}
	})
}

func TestArchiveName(t *testing.T) {
	t.Parallel()

	cases := map[string]string{
		"darwin-arm64":  "eser-v4.5.2-aarch64-apple-darwin.tar.gz",
		"linux-amd64":   "eser-v4.5.2-x86_64-unknown-linux-gnu.tar.gz",
		"windows-amd64": "eser-v4.5.2-x86_64-pc-windows-msvc.zip",
	}

	for platform, want := range cases {
		goos, goarch, _ := strings.Cut(platform, "-")
		if got, err := archiveName("4.5.2", goos, goarch); err != nil || got != want {
			t.Errorf("%s: %q, %v; want %q", platform, got, err, want)
		}
	}

	if _, err := archiveName("4.5.2", "plan9", "386"); !errors.Is(err, errUnsupportedPlatform) {
		t.Errorf("an unknown platform: %v", err)
	}
}

func TestNewerThan(t *testing.T) {
	t.Parallel()

	for _, tc := range []struct {
		a, b string
		want bool
	}{
		{"4.5.2", "4.5.1", true}, {"4.5.1", "4.5.2", false}, {"4.5.2", "4.5.2", false},
		{"5.0.0", "4.9.9", true}, {"4.10.0", "4.9.0", true}, {"4.5.2", "dev", true},
	} {
		if got := newerThan(tc.a, tc.b); got != tc.want {
			t.Errorf("newerThan(%q, %q) = %v", tc.a, tc.b, got)
		}
	}
}

// TestReleaseTriplesMatchTargetsTS keeps the Go table equal to the triples of
// pkg/@eserstack/ajan/targets.ts (decision-38).
func TestReleaseTriplesMatchTargetsTS(t *testing.T) {
	t.Parallel()

	source, err := os.ReadFile("../../pkg/@eserstack/ajan/targets.ts")
	if err != nil {
		t.Fatal(err)
	}

	entry := regexp.MustCompile(`(?s)goos: "(\w+)",\s*goarch: "(\w+)",.*?releaseTriple: "([\w-]+)"`)
	fromTS := map[string]string{}

	for _, m := range entry.FindAllStringSubmatch(string(source), -1) {
		fromTS[m[1]+"-"+m[2]] = m[3]
	}

	if len(fromTS) != len(releaseTriples) {
		t.Fatalf("targets.ts has %d targets %v, the Go table %d", len(fromTS), fromTS, len(releaseTriples))
	}

	for platform, triple := range releaseTriples {
		if fromTS[platform] != triple {
			t.Errorf("%s: Go %q, targets.ts %q", platform, triple, fromTS[platform])
		}
	}
}

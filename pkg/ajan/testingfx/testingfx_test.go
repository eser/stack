// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package testingfx_test

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/testingfx"
)

// ── FakeFs tests ─────────────────────────────────────────────────────────────

func TestFakeFs_ReadFile(t *testing.T) {
	t.Parallel()

	fs := testingfx.NewFakeFs(map[string][]byte{
		"a/b.txt": []byte("hello"),
	})

	data, err := fs.ReadFile("a/b.txt")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}

	if string(data) != "hello" {
		t.Fatalf("want %q, got %q", "hello", string(data))
	}
}

func TestFakeFs_Exists(t *testing.T) {
	t.Parallel()

	fs := testingfx.NewFakeFs(map[string][]byte{"x": []byte("y")})

	if !fs.Exists("x") {
		t.Fatal("expected x to exist")
	}

	if fs.Exists("missing") {
		t.Fatal("expected missing to not exist")
	}
}

func TestFakeFs_WriteAndRead(t *testing.T) {
	t.Parallel()

	fs := testingfx.NewFakeFs(nil)
	fs.WriteFile("new.txt", []byte("world"))

	data, err := fs.ReadFile("new.txt")
	if err != nil {
		t.Fatalf("ReadFile after write: %v", err)
	}

	if string(data) != "world" {
		t.Fatalf("want %q, got %q", "world", string(data))
	}
}

func TestFakeFs_Delete(t *testing.T) {
	t.Parallel()

	fs := testingfx.NewFakeFs(map[string][]byte{"del.txt": []byte("x")})
	fs.Delete("del.txt")

	if fs.Exists("del.txt") {
		t.Fatal("expected file to be deleted")
	}
}

func TestFakeFs_List(t *testing.T) {
	t.Parallel()

	fs := testingfx.NewFakeFs(map[string][]byte{
		"b.txt": nil,
		"a.txt": nil,
	})

	names := fs.List()
	if len(names) != 2 {
		t.Fatalf("expected 2 files, got %d", len(names))
	}

	// List must be sorted
	if names[0] != "a.txt" || names[1] != "b.txt" {
		t.Fatalf("expected sorted list, got %v", names)
	}
}

func TestFakeFs_ListDir(t *testing.T) {
	t.Parallel()

	fs := testingfx.NewFakeFs(map[string][]byte{
		"src/a.go":  nil,
		"src/b.go":  nil,
		"test/c.go": nil,
	})

	names := fs.ListDir("src")
	if len(names) != 2 {
		t.Fatalf("expected 2 files under src/, got %d: %v", len(names), names)
	}
}

func TestFakeFs_Open(t *testing.T) {
	t.Parallel()

	fs := testingfx.NewFakeFs(map[string][]byte{"hello.txt": []byte("content")})

	f, err := fs.Open("hello.txt")
	if err != nil {
		t.Fatalf("Open: %v", err)
	}

	defer func() { _ = f.Close() }()

	data, err := io.ReadAll(f)
	if err != nil && !strings.Contains(err.Error(), "closed") {
		t.Fatalf("ReadAll: %v", err)
	}

	if string(data) != "content" {
		t.Fatalf("want %q, got %q", "content", string(data))
	}
}

func TestFakeFs_Open_Missing(t *testing.T) {
	t.Parallel()

	fs := testingfx.NewFakeFs(nil)
	_, err := fs.Open("no-such-file")

	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

// ── FakeServer tests ──────────────────────────────────────────────────────────

func TestFakeServer_RespondJSON(t *testing.T) {
	t.Parallel()

	srv := testingfx.NewFakeServer()
	t.Cleanup(srv.Close)

	srv.RespondJSON("/ping", http.StatusOK, map[string]string{"pong": "true"})

	resp, err := http.Get(srv.URL() + "/ping")
	if err != nil {
		t.Fatalf("GET /ping: %v", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestFakeServer_RecordsRequests(t *testing.T) {
	t.Parallel()

	srv := testingfx.NewFakeServer()
	t.Cleanup(srv.Close)

	srv.RespondJSON("/hit", http.StatusNoContent, nil)

	http.Get(srv.URL() + "/hit") //nolint:errcheck,gosec // test-only HTTP call to local server
	http.Get(srv.URL() + "/hit") //nolint:errcheck,gosec // test-only HTTP call to local server

	if srv.RequestCount() != 2 {
		t.Fatalf("expected 2 requests, got %d", srv.RequestCount())
	}

	last := srv.LastRequest()
	if last == nil || last.Path != "/hit" {
		t.Fatalf("unexpected last request: %+v", last)
	}
}

func TestFakeServer_ResetRequests(t *testing.T) {
	t.Parallel()

	srv := testingfx.NewFakeServer()
	t.Cleanup(srv.Close)

	srv.RespondJSON("/r", http.StatusOK, nil)
	http.Get(srv.URL() + "/r") //nolint:errcheck,gosec // test-only HTTP call to local server
	srv.ResetRequests()

	if srv.RequestCount() != 0 {
		t.Fatalf("expected 0 after reset, got %d", srv.RequestCount())
	}
}

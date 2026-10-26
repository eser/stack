// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// tarballFixture gzips a tar of the given regular files.
func tarballFixture(t *testing.T, files ...[2]string) []byte {
	t.Helper()

	var buf bytes.Buffer

	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)

	for _, file := range files {
		header := &tar.Header{Name: file[0], Typeflag: tar.TypeReg, Mode: 0o644, Size: int64(len(file[1]))} //nolint:exhaustruct
		if err := tw.WriteHeader(header); err != nil {
			t.Fatal(err)
		}

		if _, err := tw.Write([]byte(file[1])); err != nil {
			t.Fatal(err)
		}
	}

	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}

	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}

	return buf.Bytes()
}

// tarballAnswer decodes the bridge answer inside an envelope.
func tarballAnswer(t *testing.T, raw string) kitExtractTarballAnswer {
	t.Helper()

	env := decodeEnvelope(t, raw)
	if env.Result == nil {
		t.Fatalf("no answer: %+v", env)
	}

	var answer kitExtractTarballAnswer
	if err := json.Unmarshal([]byte(*env.Result), &answer); err != nil {
		t.Fatalf("answer %q: %v", *env.Result, err)
	}

	return answer
}

func openTarball(t *testing.T, request map[string]any) string {
	t.Helper()

	payload, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}

	opened := tarballAnswer(t, exportStreamOpen("kitExtractTarballStream", string(payload)))
	if opened.Error != "" || opened.Handle == "" {
		t.Fatalf("open: %+v", opened)
	}

	return opened.Handle
}

func pushTarball(t *testing.T, handle string, chunk []byte, end bool) kitExtractTarballAnswer {
	t.Helper()

	payload, err := json.Marshal(kitExtractTarballPushRequest{
		Handle: handle,
		Chunk:  base64.StdEncoding.EncodeToString(chunk),
		End:    end,
	})
	if err != nil {
		t.Fatal(err)
	}

	return tarballAnswer(t, exportCall("kitExtractTarballStreamPush", string(payload)))
}

func TestKitExtractTarballStreamExtractsPushedChunks(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	archive := tarballFixture(t, [2]string{"repo-main/a.txt", "a\n"}, [2]string{"repo-main/src/b.txt", "b\n"})
	handle := openTarball(t, map[string]any{"dir": dir, "stripComponents": 1})

	var last kitExtractTarballAnswer
	for start := 0; start < len(archive); start += 7 {
		last = pushTarball(t, handle, archive[start:min(start+7, len(archive))], false)
		if last.Error != "" {
			t.Fatalf("push at %d: %+v", start, last)
		}
	}

	if !last.Done {
		last = pushTarball(t, handle, nil, true)
	}

	if !last.Done || last.Error != "" {
		t.Fatalf("end: %+v", last)
	}

	if closed := tarballAnswer(t, exportStreamClose(handle)); !closed.Done {
		t.Errorf("close: %+v", closed)
	}

	for rel, want := range map[string]string{"a.txt": "a\n", "src/b.txt": "b\n"} {
		got, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(rel))) //nolint:gosec // the test's own output
		if err != nil || string(got) != want {
			t.Errorf("%s holds %q (%v)", rel, got, err)
		}
	}
}

func TestKitExtractTarballStreamReportsALimitBeforeTheEnd(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	archive := tarballFixture(t, [2]string{"a.txt", "a\n"}, [2]string{"b.txt", "b\n"}, [2]string{"c.txt", "c\n"})
	handle := openTarball(t, map[string]any{"dir": dir, "maxEntries": 2})

	// The whole archive, but not its end: the host's download is still open.
	answer := pushTarball(t, handle, archive, false)
	if answer.Limit != "maxEntries" || answer.Max != 2 || !strings.Contains(answer.Error, "entry count exceeds maxEntries (2)") {
		t.Fatalf("push: %+v", answer)
	}

	if closed := tarballAnswer(t, exportStreamClose(handle)); closed.Limit != "maxEntries" {
		t.Errorf("close: %+v", closed)
	}

	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 2 {
		t.Errorf("extracted %v (%v), want a.txt and b.txt", entries, err)
	}
}

func TestKitExtractTarballStreamCloseStopsARunningExtraction(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	archive := tarballFixture(t, [2]string{"a.txt", strings.Repeat("a", 64<<10)})
	handle := openTarball(t, map[string]any{"dir": dir})

	if answer := pushTarball(t, handle, archive[:len(archive)/2], false); answer.Error != "" || answer.Done {
		t.Fatalf("push: %+v", answer)
	}

	closed := tarballAnswer(t, exportStreamClose(handle))
	if !strings.Contains(closed.Error, "closed before the archive ended") {
		t.Fatalf("close: %+v", closed)
	}

	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("a stopped extraction left %v", entries)
	}

	// The handle is gone; a second close succeeds with nothing to report.
	if again := tarballAnswer(t, exportStreamClose(handle)); again.Error != "" {
		t.Errorf("second close: %+v", again)
	}

	if answer := pushTarball(t, handle, nil, true); !strings.Contains(answer.Error, "unknown tarball extraction handle") {
		t.Errorf("push after close: %+v", answer)
	}
}

func TestKitExtractTarballStreamRefusesInvalidOptions(t *testing.T) {
	t.Parallel()

	for _, request := range []string{`{"dir":""}`, `{"dir":"x","maxBytes":-1}`} {
		answer := tarballAnswer(t, exportStreamOpen("kitExtractTarballStream", request))
		if answer.Error == "" || answer.Handle != "" {
			t.Errorf("open %s: %+v", request, answer)
		}
	}
}

//go:build !wasip1

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// decodeEnvelope parses an export's answer, failing the test when it is not
// an envelope.
func decodeEnvelope(t *testing.T, answer string) envelope {
	t.Helper()

	var env envelope
	if err := json.Unmarshal([]byte(answer), &env); err != nil {
		t.Fatalf("not an envelope: %q: %v", answer, err)
	}

	return env
}

func TestEserAjanCallUnknownNameAnswersUnknownFunction(t *testing.T) {
	t.Parallel()

	env := decodeEnvelope(t, exportCall("noSuchFunction", "{}"))
	if env.OK || env.Code != codeUnknownFunction || env.Result != nil {
		t.Errorf("unknown name: %+v", env)
	}

	if !strings.Contains(env.Error, "unknown function: noSuchFunction") {
		t.Errorf("the error names the function: %q", env.Error)
	}

	after := decodeEnvelope(t, exportCall("formatList", ""))
	if !after.OK {
		t.Errorf("a call after the unknown name must succeed: %+v", after)
	}
}

func TestEserAjanCallRecoversAPanickingHandler(t *testing.T) {
	// Not parallel: it adds names to the shared registry.
	register("testPanicsOnPurpose", func(string) string { panic("on purpose") })
	registerStream("testPanickingStream", "testpanic", streamFuncs{
		open:  func(string) string { return `{"handle":"testpanic-1"}` },
		read:  func(string) string { panic("read on purpose") },
		close: func(string) string { return "{}" },
	})
	t.Cleanup(func() {
		delete(registry, "testPanicsOnPurpose")
		delete(registry, "testPanickingStream")
		delete(streamPrefixes, "testpanic")
	})

	panicked := decodeEnvelope(t, exportCall("testPanicsOnPurpose", ""))
	if panicked.OK || panicked.Code != codePanic || !strings.Contains(panicked.Error, "panic: on purpose") {
		t.Errorf("a panic must become a failed envelope: %+v", panicked)
	}

	if panicked.Result == nil || !strings.Contains(*panicked.Result, `"error":"panic: on purpose"`) {
		t.Errorf("the panic's error JSON is the result: %+v", panicked)
	}

	read := decodeEnvelope(t, exportStreamRead("testpanic-1"))
	if read.OK || read.Code != codePanic {
		t.Errorf("a panicking read must become a failed envelope: %+v", read)
	}

	after := decodeEnvelope(t, exportCall("formatList", ""))
	if !after.OK {
		t.Errorf("a call after the panic must succeed: %+v", after)
	}
}

func TestEserAjanCallHandlerErrorKeepsTheAnswer(t *testing.T) {
	t.Parallel()

	env := decodeEnvelope(t, exportCall("formatEncode", "not json"))
	if env.OK || env.Code != codeHandlerError || env.Error == "" {
		t.Fatalf("an answer with an error field fails the envelope: %+v", env)
	}

	if env.Result == nil || !strings.Contains(*env.Result, `"error"`) {
		t.Errorf("the full answer stays in result: %+v", env)
	}
}

func TestEserAjanCallRefusesTheWrongKind(t *testing.T) {
	t.Parallel()

	call := decodeEnvelope(t, exportCall("codebaseWalkFilesStream", "{}"))
	if call.OK || call.Code != codeKindMismatch {
		t.Errorf("a call on a stream name: %+v", call)
	}

	open := decodeEnvelope(t, exportStreamOpen("formatList", ""))
	if open.OK || open.Code != codeKindMismatch {
		t.Errorf("a stream open on a call name: %+v", open)
	}
}

func TestEserAjanCallRefusesADeeplyNestedRequest(t *testing.T) {
	t.Parallel()

	deep := `{"format":"json","data":` + strings.Repeat("[", 10_000) + strings.Repeat("]", 10_000) + `}`

	env := decodeEnvelope(t, exportCall("formatEncode", deep))
	if env.OK || env.Code != codeBadRequest || !strings.Contains(env.Error, "more than 1000 levels") {
		t.Errorf("a request nested 10,000 levels deep must be refused: %+v", env)
	}
}

func TestEserAjanStreamWalksAndCloses(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "a.ts"), []byte("export const a = 1;\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	request := marshalResponse(map[string]any{"dir": dir, "extensions": []string{".ts"}})

	opened := decodeEnvelope(t, exportStreamOpen("codebaseWalkFilesStream", request))
	if !opened.OK || opened.Result == nil {
		t.Fatalf("open: %+v", opened)
	}

	var created struct {
		Handle string `json:"handle"`
	}
	if err := json.Unmarshal([]byte(*opened.Result), &created); err != nil || !strings.HasPrefix(created.Handle, "cbwalk-") {
		t.Fatalf("open answer %q: %v", *opened.Result, err)
	}

	var chunks []string

	for range 10 {
		read := decodeEnvelope(t, exportStreamRead(created.Handle))
		if !read.OK || read.Result == nil {
			t.Fatalf("read: %+v", read)
		}

		chunks = append(chunks, *read.Result)
		if strings.Contains(*read.Result, `"done":true`) || *read.Result == "null" {
			break
		}
	}

	if !strings.Contains(strings.Join(chunks, "\n"), "a.ts") {
		t.Errorf("the walk did not reach a.ts: %q", chunks)
	}

	if closed := decodeEnvelope(t, exportStreamClose(created.Handle)); !closed.OK {
		t.Errorf("close: %+v", closed)
	}
}

func TestEserAjanStreamReadRefusesAnUnknownHandle(t *testing.T) {
	t.Parallel()

	for _, handle := range []string{"", "nohandle", "nosuchprefix-3", "-3"} {
		env := decodeEnvelope(t, exportStreamRead(handle))
		if env.OK || env.Code != codeUnknownHandle || env.Result != nil {
			t.Errorf("read %q: %+v", handle, env)
		}
	}
}

func TestEserAjanVersionIsTheHandshake(t *testing.T) {
	t.Parallel()

	var got handshake
	if err := json.Unmarshal([]byte(exportVersion()), &got); err != nil {
		t.Fatal(err)
	}

	if got.ABI != abiVersion || got.Profile != "native" || got.Version != Version {
		t.Errorf("handshake: %+v", got)
	}

	if !slices.IsSorted(got.Names) || !slices.Contains(got.Names, "formatEncode") {
		t.Errorf("names: %v", got.Names)
	}

	for _, stream := range got.Streams {
		if !slices.Contains(got.Names, stream) {
			t.Errorf("stream %s is not among the names", stream)
		}
	}

	version := decodeEnvelope(t, exportCall("version", ""))
	if !version.OK || version.Result == nil || *version.Result != exportVersion() {
		t.Errorf("the version call answers the same handshake: %+v", version)
	}
}

func TestRegistryServesEveryDomain(t *testing.T) {
	t.Parallel()

	// The native build registers every domain: 75 calls and 8 streams.
	if got := len(registeredNames()); got != 83 {
		t.Errorf("expected 83 registered names, got %d: %v", got, registeredNames())
	}

	want := []string{
		"aiTextStream",
		"codebaseValidateFilesStream",
		"codebaseWalkFilesStream",
		"httpRequestStream",
		"parsingTokenizeStream",
		"shellExecStream",
		"shellPtyStream",
		"shellTuiKeypressStream",
	}
	if got := registeredStreams(); !slices.Equal(got, want) {
		t.Errorf("streams: %v", got)
	}
}

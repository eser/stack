// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/codebasefx"
)

// ─── log: concurrent write vs configure ──────────────────────────────────────

// safetyLogHandle creates a log handle and registers its close.
func safetyLogHandle(t *testing.T, configJSON string) string {
	t.Helper()

	var resp struct {
		Handle string `json:"handle"`
		Error  string `json:"error"`
	}

	if err := json.Unmarshal([]byte(bridgeLogCreate(configJSON)), &resp); err != nil {
		t.Fatalf("bridgeLogCreate: unmarshal: %v", err)
	}

	if resp.Error != "" {
		t.Fatalf("bridgeLogCreate: %s", resp.Error)
	}

	t.Cleanup(func() { bridgeLogClose(resp.Handle) })

	return resp.Handle
}

// TestLogWriteAndConfigureDoNotRace pins that the filter chain and formatter on
// a log handle are published safely.
//
// Deno declares the log FFI symbols nonblocking, so Write and Configure on one
// handle genuinely land on different threads. Configure used to write
// entry.filters and entry.formatter with no lock at all while Write read both,
// which -race reports as a data race on this exercise.
//
// The category filter is installed up front so every write is dropped before it
// reaches stderr -- the test is about the field access, not the output.
func TestLogWriteAndConfigureDoNotRace(t *testing.T) {
	t.Parallel()

	handle := safetyLogHandle(t, `{"scopeName":"myapp","level":"INFO"}`)

	install := fmt.Sprintf(
		`{"handle":%q,"filters":[{"type":"category","category":"allowed"}],"formatter":"text"}`,
		handle,
	)
	if got := bridgeLogConfigure(install); got != "{}" {
		t.Fatalf("configure: %s", got)
	}

	const (
		writers     = 8
		configurers = 4
		iterations  = 250
	)

	writePayload := fmt.Sprintf(`{"handle":%q,"level":"INFO","message":"racing"}`, handle)
	formatters := [...]string{"text", "json", "span-text", "span-json"}

	var wg sync.WaitGroup

	for range writers {
		wg.Add(1)

		go func() {
			defer wg.Done()

			for range iterations {
				if got := bridgeLogWrite(writePayload); got == "" {
					t.Error("bridgeLogWrite returned an empty response")

					return
				}
			}
		}()
	}

	for i := range configurers {
		wg.Add(1)

		go func(seed int) {
			defer wg.Done()

			for j := range iterations {
				payload := fmt.Sprintf(
					`{"handle":%q,"filters":[{"type":"category","category":"allowed"}],"formatter":%q}`,
					handle, formatters[(seed+j)%len(formatters)],
				)
				if got := bridgeLogConfigure(payload); got != "{}" {
					t.Errorf("bridgeLogConfigure: %s", got)

					return
				}
			}
		}(i)
	}

	wg.Wait()
}

// ─── log: the level gate applies to the custom formatter path too ────────────

// TestLogLevelGateAppliesToTheFormatterPath pins that a handle configured with
// a custom formatter emits exactly the records it reports as enabled.
//
// The formatter path writes straight to stderr; before the fix it consulted no
// level at all, so a handle configured at ERROR still emitted DEBUG records
// while bridgeLogShouldLog answered "disabled" for the very same level.
func TestLogLevelGateAppliesToTheFormatterPath(t *testing.T) {
	t.Parallel()

	handle := safetyLogHandle(t, `{"level":"INFO"}`)

	cfg := fmt.Sprintf(`{"handle":%q,"level":"ERROR","formatter":"text"}`, handle)
	if got := bridgeLogConfigure(cfg); got != "{}" {
		t.Fatalf("configure: %s", got)
	}

	tests := []struct {
		level       string
		wantAllowed bool
	}{
		{level: "DEBUG", wantAllowed: false},
		{level: "INFO", wantAllowed: false},
		{level: "WARN", wantAllowed: false},
		{level: "ERROR", wantAllowed: true},
	}

	for _, tt := range tests {
		t.Run(tt.level, func(t *testing.T) {
			t.Parallel()

			var should logShouldLogResponse

			raw := bridgeLogShouldLog(fmt.Sprintf(`{"handle":%q,"level":%q}`, handle, tt.level))
			if err := json.Unmarshal([]byte(raw), &should); err != nil {
				t.Fatalf("shouldLog unmarshal: %v", err)
			}

			if should.Allowed != tt.wantAllowed {
				t.Fatalf("shouldLog(%s) = %v, want %v", tt.level, should.Allowed, tt.wantAllowed)
			}

			write := bridgeLogWrite(
				fmt.Sprintf(`{"handle":%q,"level":%q,"message":"gate check"}`, handle, tt.level),
			)

			var resp map[string]any
			if err := json.Unmarshal([]byte(write), &resp); err != nil {
				t.Fatalf("write unmarshal: %v", err)
			}

			filtered, _ := resp["filtered"].(bool)
			if emitted := !filtered; emitted != tt.wantAllowed {
				t.Fatalf(
					"formatter path emitted=%v at %s but shouldLog says allowed=%v (response %s)",
					emitted, tt.level, tt.wantAllowed, write,
				)
			}
		})
	}
}

// ─── codebase: results carry the name of the validator that produced them ────

// TestValidatorResultsCarryTheirOwnName pins that every result is labelled with
// the validator that actually produced it.
//
// The name list and the validator list used to be built independently and
// disagreed from index 1 onward, so trailing-whitespace issues arrived as "bom"
// and merge-conflict issues as "line-endings". Each case below plants exactly
// one defect and asserts only its own validator reports anything.
func TestValidatorResultsCarryTheirOwnName(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		filename string
		content  string
		want     string
	}{
		{
			name:     "missing final newline",
			filename: "eof.txt",
			content:  "no trailing newline",
			want:     "eof",
		},
		{
			name:     "trailing whitespace",
			filename: "trailing.txt",
			content:  "value   \nclean\n",
			want:     "trailing",
		},
		{
			name:     "utf8 bom",
			filename: "bom.txt",
			content:  "\xEF\xBB\xBFhello\n",
			want:     "bom",
		},
		{
			name:     "merge conflict marker",
			filename: "conflict.txt",
			content:  "<<<<<<< HEAD\nmine\n",
			want:     "merge-conflicts",
		},
		{
			name:     "mixed line endings",
			filename: "endings.txt",
			content:  "first\r\nsecond\n",
			want:     "line-endings",
		},
		{
			name:     "leaked credential",
			filename: "creds.txt",
			content:  "AKIAIOSFODNN7EXAMPLE\n",
			want:     "secrets",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			dir := t.TempDir()

			path := filepath.Join(dir, tt.filename)
			if err := os.WriteFile(path, []byte(tt.content), 0o600); err != nil {
				t.Fatalf("write fixture: %v", err)
			}

			results := safetyValidateDir(t, dir, nil)

			byName := make(map[string]codebaseValidatorResultJSON, len(results))
			for _, r := range results {
				if _, dup := byName[r.Name]; dup {
					t.Fatalf("validator %q reported twice", r.Name)
				}

				byName[r.Name] = r
			}

			got, ok := byName[tt.want]
			if !ok {
				t.Fatalf("no result named %q; got %v", tt.want, safetyResultNames(results))
			}

			if len(got.Issues) == 0 {
				t.Fatalf("validator %q reported no issues for its own defect", tt.want)
			}

			for _, r := range results {
				if r.Name == tt.want {
					continue
				}

				if len(r.Issues) != 0 {
					t.Fatalf(
						"validator %q reported %d issue(s) for a %q defect: %+v",
						r.Name, len(r.Issues), tt.want, r.Issues,
					)
				}
			}
		})
	}
}

// TestValidatorRequestOrderIsPreserved pins that an explicit request is
// labelled in the order it was made, not in builtin order.
func TestValidatorRequestOrderIsPreserved(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "sample.txt"), []byte("ok\n"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	requested := []string{"secrets", "eof", "bom"}

	results := safetyValidateDir(t, dir, requested)
	if len(results) != len(requested) {
		t.Fatalf("got %d results for %d requested validators", len(results), len(requested))
	}

	for i, want := range requested {
		if results[i].Name != want {
			t.Fatalf("result %d named %q, want %q", i, results[i].Name, want)
		}
	}
}

// TestUnknownValidatorIsRejected pins that an unrecognised name is an error.
//
// Unknown names used to be dropped from the validator list while the name list
// still echoed the request verbatim, so asking for ["bogus","eof"] returned the
// EOF result labelled "bogus".
func TestUnknownValidatorIsRejected(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "sample.txt"), []byte("ok\n"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}

	payload := fmt.Sprintf(`{"dir":%q,"validators":["bogus","eof"],"gitAware":false}`, dir)

	var resp codebaseValidateResponse
	if err := json.Unmarshal([]byte(bridgeCodebaseValidateFiles(payload)), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if resp.Error == "" {
		t.Fatalf("expected an error for an unknown validator, got results %v", safetyResultNames(resp.Results))
	}

	for _, r := range resp.Results {
		if r.Name == "bogus" {
			t.Fatal(`a result came back labelled "bogus"`)
		}
	}
}

// TestDefaultValidatorEntriesMatchBuiltins pins the default pairing against
// codebasefx.BuiltinValidators by function identity, so a reordering there
// cannot silently re-introduce mislabelled results.
func TestDefaultValidatorEntriesMatchBuiltins(t *testing.T) {
	t.Parallel()

	entries := defaultValidatorEntries()

	builtins := codebasefx.BuiltinValidators()
	if len(entries) != len(builtins) {
		t.Fatalf("default entries: %d, codebasefx.BuiltinValidators: %d", len(entries), len(builtins))
	}

	for i, entry := range entries {
		gotFn := reflect.ValueOf(entry.fn).Pointer()

		wantFn := reflect.ValueOf(builtins[i]).Pointer()
		if gotFn != wantFn {
			t.Fatalf(
				"entry %d named %q is not codebasefx.BuiltinValidators()[%d]",
				i, entry.name, i,
			)
		}
	}
}

// safetyValidateDir runs bridgeCodebaseValidateFiles over dir and returns the
// decoded results.
func safetyValidateDir(t *testing.T, dir string, validators []string) []codebaseValidatorResultJSON {
	t.Helper()

	req := codebaseValidateRequest{ //nolint:exhaustruct
		Dir:        dir,
		Validators: validators,
		GitAware:   false,
	}

	payload, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request: %v", err)
	}

	var resp codebaseValidateResponse
	if err := json.Unmarshal([]byte(bridgeCodebaseValidateFiles(string(payload))), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if resp.Error != "" {
		t.Fatalf("bridgeCodebaseValidateFiles: %s", resp.Error)
	}

	return resp.Results
}

// safetyResultNames extracts the reported names, for failure messages.
func safetyResultNames(results []codebaseValidatorResultJSON) []string {
	names := make([]string, 0, len(results))
	for _, r := range results {
		names = append(names, r.Name)
	}

	return names
}

// ─── close is idempotent for every handle kind ───────────────────────────────

// safetyHasError reports whether a bridge response carries an "error" field.
func safetyHasError(t *testing.T, raw string) bool {
	t.Helper()

	var resp struct {
		Error string `json:"error"`
	}

	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal %q: %v", raw, err)
	}

	return resp.Error != ""
}

// TestCloseIsIdempotent pins the uniform close contract: closing a handle that
// is already closed, or was never opened, succeeds.
//
// Double close used to error for model/http/log/pty/exec/tokenizer/keypress
// handles while the cache, posts, ai-stream and codebase-stream closes were
// already silently idempotent -- the same call answering two different ways
// depending on which subsystem the handle came from.
func TestCloseIsIdempotent(t *testing.T) {
	t.Parallel()

	tests := []struct {
		open  func(t *testing.T) string
		close func(handle string) string
		name  string
	}{
		{
			name: "log",
			open: func(t *testing.T) string {
				t.Helper()

				var resp struct {
					Handle string `json:"handle"`
				}
				if err := json.Unmarshal([]byte(bridgeLogCreate(`{}`)), &resp); err != nil {
					t.Fatalf("create: %v", err)
				}

				return resp.Handle
			},
			close: bridgeLogClose,
		},
		{
			name: "http client",
			open: func(t *testing.T) string {
				t.Helper()

				var resp struct {
					Handle string `json:"handle"`
				}
				if err := json.Unmarshal([]byte(bridgeHttpCreate(`{}`)), &resp); err != nil {
					t.Fatalf("create: %v", err)
				}

				return resp.Handle
			},
			close: bridgeHttpClose,
		},
		{
			name: "tokenizer",
			open: func(t *testing.T) string {
				t.Helper()

				var resp parsingTokenizerHandleResponse
				if err := json.Unmarshal([]byte(bridgeParsingTokenizerCreate(`{}`)), &resp); err != nil {
					t.Fatalf("create: %v", err)
				}

				return resp.Handle
			},
			close: func(handle string) string {
				return bridgeParsingTokenizerClose(fmt.Sprintf(`{"handle":%q}`, handle))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			handle := tt.open(t)
			if handle == "" {
				t.Fatal("open returned an empty handle")
			}

			if raw := tt.close(handle); safetyHasError(t, raw) {
				t.Fatalf("first close reported an error: %s", raw)
			}

			if raw := tt.close(handle); safetyHasError(t, raw) {
				t.Fatalf("second close reported an error: %s", raw)
			}

			if raw := tt.close("never-opened"); safetyHasError(t, raw) {
				t.Fatalf("closing an unknown handle reported an error: %s", raw)
			}
		})
	}
}

// TestCloseOfUnknownHandleSucceedsEverywhere covers the close paths whose
// handles are expensive to open for real.
func TestCloseOfUnknownHandleSucceedsEverywhere(t *testing.T) {
	t.Parallel()

	tests := []struct {
		close func(handle string) string
		name  string
	}{
		{name: "ai model", close: bridgeAiCloseModel},
		{name: "ai stream", close: bridgeAiFreeStream},
		{name: "http stream", close: bridgeHttpStreamClose},
		{name: "exec", close: bridgeShellExecClose},
		{name: "pty", close: bridgeShellPtyClose},
		{name: "keypress", close: bridgeShellTuiKeypressClose},
		{name: "codebase walk stream", close: bridgeCodebaseWalkFilesStreamClose},
		{name: "codebase validate stream", close: bridgeCodebaseValidateFilesStreamClose},
		{
			name: "cache",
			close: func(handle string) string {
				return bridgeCacheClose(fmt.Sprintf(`{"handle":%q}`, handle))
			},
		},
		{
			name: "posts",
			close: func(handle string) string {
				return bridgePostsClose(fmt.Sprintf(`{"handle":%q}`, handle))
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if raw := tt.close("never-opened"); safetyHasError(t, raw) {
				t.Fatalf("closing an unknown handle reported an error: %s", raw)
			}
		})
	}
}

// ─── http stream: close must not queue behind a stalled read ─────────────────

// TestHttpStreamCloseDoesNotWaitForAStalledRead pins that closing a stream
// whose read is parked on the network returns promptly.
//
// The read holds the per-entry lock for the whole of body.Read. Close used to
// take that same lock before touching the body, so closing an idle SSE or
// long-poll stream blocked the calling FFI thread until the server happened to
// send something -- possibly never.
func TestHttpStreamCloseDoesNotWaitForAStalledRead(t *testing.T) {
	t.Parallel()

	entered := make(chan struct{})
	release := make(chan struct{})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)

		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}

		close(entered)
		<-release
	}))

	defer srv.Close()
	defer close(release)

	var client struct {
		Handle string `json:"handle"`
	}

	if err := json.Unmarshal([]byte(bridgeHttpCreate(`{}`)), &client); err != nil {
		t.Fatalf("bridgeHttpCreate: %v", err)
	}

	defer bridgeHttpClose(client.Handle)

	openReq := fmt.Sprintf(`{"handle":%q,"method":"GET","url":%q}`, client.Handle, srv.URL)

	var opened struct {
		Handle string `json:"handle"`
		Error  string `json:"error"`
	}

	if err := json.Unmarshal([]byte(bridgeHttpRequestStream(openReq)), &opened); err != nil {
		t.Fatalf("bridgeHttpRequestStream: %v", err)
	}

	if opened.Error != "" {
		t.Fatalf("bridgeHttpRequestStream: %s", opened.Error)
	}

	<-entered

	readDone := make(chan string, 1)

	go func() { readDone <- bridgeHttpStreamRead(opened.Handle) }()

	// Give the read time to reach body.Read and park there. Too short only
	// weakens the test; it can never make it fail spuriously.
	time.Sleep(100 * time.Millisecond)

	closeDone := make(chan string, 1)

	go func() { closeDone <- bridgeHttpStreamClose(opened.Handle) }()

	const limit = 5 * time.Second

	select {
	case <-closeDone:
	case <-time.After(limit):
		t.Fatalf("bridgeHttpStreamClose blocked for %s behind an in-flight read", limit)
	}

	select {
	case <-readDone:
	case <-time.After(limit):
		t.Fatalf("the stalled read was not unblocked within %s of the close", limit)
	}
}

// ─── ai models: close waits for in-flight calls ──────────────────────────────

// safetySlowModel blocks inside GenerateText until released, and records
// whether it was closed while a generation was still running.
type safetySlowModel struct {
	started  chan struct{}
	release  chan struct{}
	mu       sync.Mutex
	inFlight int
	closedIn bool
}

func newSafetySlowModel() *safetySlowModel {
	return &safetySlowModel{ //nolint:exhaustruct
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
}

func (m *safetySlowModel) GetCapabilities() []aifx.ProviderCapability { return nil }
func (m *safetySlowModel) GetProvider() string                        { return "safety-stub" }
func (m *safetySlowModel) GetModelID() string                         { return "safety-stub-model" }
func (m *safetySlowModel) GetRawClient() any                          { return nil }

func (m *safetySlowModel) Close(_ context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.inFlight > 0 {
		m.closedIn = true
	}

	return nil
}

func (m *safetySlowModel) GenerateText(
	_ context.Context,
	_ *aifx.GenerateTextOptions,
) (*aifx.GenerateTextResult, error) {
	m.mu.Lock()
	m.inFlight++
	m.mu.Unlock()

	close(m.started)
	<-m.release

	m.mu.Lock()
	m.inFlight--
	m.mu.Unlock()

	return &aifx.GenerateTextResult{ //nolint:exhaustruct
		Content: []aifx.ContentBlock{{Type: aifx.ContentBlockText, Text: "answered"}}, //nolint:exhaustruct
	}, nil
}

func (m *safetySlowModel) StreamText(
	_ context.Context,
	_ *aifx.StreamTextOptions,
) (*aifx.StreamIterator, error) {
	return nil, context.Canceled
}

func (m *safetySlowModel) closedDuringGeneration() bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.closedIn
}

// TestCloseModelWaitsForInFlightGeneration pins that a model is not torn down
// underneath a generation that is already running.
//
// bridgeAiGenerateText used to copy the model out under a read lock and drop
// it immediately, leaving a concurrent close free to shut the provider down
// mid-call. Streams already had this protection via streamState.wg; models did
// not.
func TestCloseModelWaitsForInFlightGeneration(t *testing.T) {
	model := newSafetySlowModel()
	handle := newHandle("model")

	handleMu.Lock()
	modelHandles[handle] = model
	handleMu.Unlock()

	t.Cleanup(func() {
		handleMu.Lock()
		delete(modelHandles, handle)
		delete(modelInFlight, handle)
		handleMu.Unlock()
	})

	generateDone := make(chan string, 1)

	go func() {
		generateDone <- bridgeAiGenerateText(
			handle,
			`{"requestId":"in-flight","messages":[],"system":"","maxTokens":0,"toolChoice":""}`,
		)
	}()

	<-model.started

	closeDone := make(chan string, 1)

	go func() { closeDone <- bridgeAiCloseModel(handle) }()

	// The close must still be waiting: nothing has released the generation.
	select {
	case raw := <-closeDone:
		t.Fatalf("close returned %q while a generation was still running", raw)
	case <-time.After(150 * time.Millisecond):
	}

	close(model.release)

	const limit = 5 * time.Second

	select {
	case <-generateDone:
	case <-time.After(limit):
		t.Fatalf("generation did not finish within %s", limit)
	}

	select {
	case <-closeDone:
	case <-time.After(limit):
		t.Fatalf("close did not finish within %s of the generation completing", limit)
	}

	if model.closedDuringGeneration() {
		t.Fatal("the model was closed while a generation was still in flight")
	}
}

package main

import (
	"context"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/eser/stack/pkg/ajan/aifx"
)

// The property under test is that a cancellation is never lost, in either
// order. The interesting case is the one that looks impossible from
// TypeScript's side: because the generation symbol runs on a threadpool, the
// caller dispatches the work and only then attaches its abort listener, so an
// abort can reach Go before the request it names exists.

func resetCancelRegistry(t *testing.T) {
	t.Helper()

	aiCancelMu.Lock()
	aiCancels = make(map[string]*aiRequest)
	aiCancelMu.Unlock()
}

func registrySize() int {
	aiCancelMu.Lock()
	defer aiCancelMu.Unlock()

	return len(aiCancels)
}

// TestCancelStopsAnInFlightRequest is the ordinary case: the request is running
// when the cancel arrives.
func TestCancelStopsAnInFlightRequest(t *testing.T) {
	resetCancelRegistry(t)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if !beginAIRequest("req-1", cancel) {
		t.Fatal("a fresh request was refused")
	}

	if ctx.Err() != nil {
		t.Fatal("the context died before anything cancelled it")
	}

	if !cancelAIRequest("req-1") {
		t.Fatal("cancelling a live request reported nothing to cancel")
	}

	<-ctx.Done()

	if registrySize() != 0 {
		t.Fatalf("registry still holds %d entries after cancel", registrySize())
	}
}

// TestCancelBeforeRegistrationStillStopsTheRequest is the race this design
// exists for.
//
// Without the tombstone the early cancel is dropped, beginAIRequest returns
// true, and the request runs to completion against a provider the caller has
// already walked away from -- which is a real API charge for an answer nobody
// will read.
func TestCancelBeforeRegistrationStillStopsTheRequest(t *testing.T) {
	resetCancelRegistry(t)

	// The abort lands first.
	cancelAIRequest("req-early")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if beginAIRequest("req-early", cancel) {
		t.Fatal("a request cancelled before it registered was allowed to start")
	}

	// And the context must already be dead, so nothing downstream proceeds.
	if ctx.Err() == nil {
		t.Fatal("the context was left alive after a pre-registration cancel")
	}

	if registrySize() != 0 {
		t.Fatalf("the tombstone was not consumed: %d entries left", registrySize())
	}
}

// TestEndReleasesTheRegistration pins that a completed request stops being
// tracked -- otherwise every call leaks an entry for the process lifetime.
func TestEndReleasesTheRegistration(t *testing.T) {
	resetCancelRegistry(t)

	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	beginAIRequest("req-2", cancel)
	endAIRequest("req-2")

	if registrySize() != 0 {
		t.Fatalf("registry holds %d entries after the request ended", registrySize())
	}

	// A cancel arriving after completion is normal -- the abort listener and
	// the response race -- and must not fail or resurrect anything permanent.
	cancelAIRequest("req-2")

	if registrySize() > 1 {
		t.Fatalf("a late cancel grew the registry to %d", registrySize())
	}
}

// TestRequestWithoutAnIDIsUntracked pins backward compatibility: a caller that
// sends no requestId gets an uncancellable request rather than an error, and
// nothing accumulates for it.
func TestRequestWithoutAnIDIsUntracked(t *testing.T) {
	resetCancelRegistry(t)

	_, cancel := context.WithCancel(context.Background())
	defer cancel()

	if !beginAIRequest("", cancel) {
		t.Fatal("a request without an id was refused")
	}

	endAIRequest("")

	if cancelAIRequest("") {
		t.Fatal("cancelling the empty id claimed to cancel something")
	}

	if registrySize() != 0 {
		t.Fatalf("the empty id was tracked: %d entries", registrySize())
	}
}

// TestTombstonesAreBounded pins that ids which never run cannot grow the table
// without limit.
func TestTombstonesAreBounded(t *testing.T) {
	resetCancelRegistry(t)

	for i := range maxTrackedCancels + 500 {
		cancelAIRequest("ghost-" + strconv.Itoa(i))
	}

	if got := registrySize(); got > maxTrackedCancels {
		t.Fatalf("registry grew to %d, past the %d cap", got, maxTrackedCancels)
	}
}

// TestCancelRegistryUnderConcurrency is the race detector's problem, not the
// assertions': begin, end and cancel are called from different threads in
// production (the threadpool runs the request, the isolate fires the abort).
func TestCancelRegistryUnderConcurrency(t *testing.T) {
	resetCancelRegistry(t)

	var wg sync.WaitGroup

	for i := range 64 {
		id := "race-" + strconv.Itoa(i)

		wg.Add(2)

		go func() {
			defer wg.Done()

			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			if beginAIRequest(id, cancel) {
				endAIRequest(id)
			} else if ctx.Err() == nil {
				t.Errorf("%s was refused but its context was left alive", id)
			}
		}()

		go func() {
			defer wg.Done()

			cancelAIRequest(id)
		}()
	}

	wg.Wait()
}

// TestCancelSymbolAcceptsAnyOutcome pins the FFI-facing shape.
//
// "Nothing to cancel" is the normal result of a request that finished a moment
// earlier, so reporting it as an error would make every well-behaved caller log
// a failure on the happy path.
func TestCancelSymbolAcceptsAnyOutcome(t *testing.T) {
	resetCancelRegistry(t)

	if got := bridgeAiCancelRequest(`{"requestId":"nobody"}`); got != `{}` {
		t.Fatalf("cancelling an unknown id returned %q, want {}", got)
	}

	if got := bridgeAiCancelRequest(`not json`); got == `{}` {
		t.Fatal("malformed JSON was accepted as a successful cancel")
	}
}

// TestRequestIDCrossesTheWire pins that the id actually decodes, since the
// whole mechanism is inert if the field is dropped like the options once were.
func TestRequestIDCrossesTheWire(t *testing.T) {
	_, requestID, err := parseGenerateRequestWithID(
		`{"requestId":"abc-123","messages":[],"system":"","maxTokens":0,"toolChoice":""}`,
	)
	if err != nil {
		t.Fatalf("parseGenerateRequestWithID: %v", err)
	}

	if requestID != "abc-123" {
		t.Fatalf("requestId = %q, want abc-123", requestID)
	}
}

// stubModel records whether the provider was ever reached.
type stubModel struct {
	mu     sync.Mutex
	called bool
	ctxErr error
}

func (m *stubModel) GetCapabilities() []aifx.ProviderCapability { return nil }
func (m *stubModel) GetProvider() string                        { return "stub" }
func (m *stubModel) GetModelID() string                         { return "stub-1" }
func (m *stubModel) GetRawClient() any                          { return nil }
func (m *stubModel) Close(_ context.Context) error              { return nil }

func (m *stubModel) GenerateText(
	ctx context.Context,
	_ *aifx.GenerateTextOptions,
) (*aifx.GenerateTextResult, error) {
	m.mu.Lock()
	m.called = true
	m.ctxErr = ctx.Err()
	m.mu.Unlock()

	return &aifx.GenerateTextResult{ //nolint:exhaustruct
		Content:    []aifx.ContentBlock{{Type: aifx.ContentBlockText, Text: "answered"}}, //nolint:exhaustruct
		StopReason: aifx.StopReasonEndTurn,
	}, nil
}

func (m *stubModel) StreamText(
	_ context.Context,
	_ *aifx.StreamTextOptions,
) (*aifx.StreamIterator, error) {
	return nil, context.Canceled
}

func (m *stubModel) wasCalled() bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.called
}

func withStubModel(t *testing.T, model aifx.LanguageModel) string {
	t.Helper()

	handle := newHandle("test-model")

	handleMu.Lock()
	modelHandles[handle] = model
	handleMu.Unlock()

	t.Cleanup(func() {
		handleMu.Lock()
		delete(modelHandles, handle)
		handleMu.Unlock()
	})

	return handle
}

// TestGenerateRefusesAPreCancelledRequest is the end-to-end version of the
// race, through the real bridge entry point.
//
// The provider must never be reached. Starting the call and cancelling it a
// moment later is not equivalent: the request would already be in flight, which
// for a hosted model means a billed round-trip for an answer the caller has
// explicitly abandoned.
func TestGenerateRefusesAPreCancelledRequest(t *testing.T) {
	resetCancelRegistry(t)

	model := &stubModel{} //nolint:exhaustruct
	handle := withStubModel(t, model)

	cancelAIRequest("pre-cancelled")

	raw := bridgeAiGenerateText(
		handle,
		`{"requestId":"pre-cancelled","messages":[],"system":"","maxTokens":0,"toolChoice":""}`,
	)

	if model.wasCalled() {
		t.Fatal("the provider was called for a request that was already cancelled")
	}

	if !strings.Contains(raw, "cancelled") {
		t.Fatalf("response %q does not report the cancellation", raw)
	}
}

// TestGenerateRunsAndCleansUpWhenNotCancelled guards the test above from
// passing because generation is broken outright, and pins that a completed
// request stops being tracked.
func TestGenerateRunsAndCleansUpWhenNotCancelled(t *testing.T) {
	resetCancelRegistry(t)

	model := &stubModel{} //nolint:exhaustruct
	handle := withStubModel(t, model)

	raw := bridgeAiGenerateText(
		handle,
		`{"requestId":"live","messages":[],"system":"","maxTokens":0,"toolChoice":""}`,
	)

	if !model.wasCalled() {
		t.Fatal("an uncancelled request never reached the provider")
	}

	if !strings.Contains(raw, "answered") {
		t.Fatalf("response %q does not carry the model's answer", raw)
	}

	if registrySize() != 0 {
		t.Fatalf("the finished request is still tracked: %d entries", registrySize())
	}
}

// TestGenerateHandsTheProviderALiveContext pins that the context threaded into
// the provider is the cancellable one and is not already dead -- a cancel bound
// to the wrong context would cancel nothing.
func TestGenerateHandsTheProviderALiveContext(t *testing.T) {
	resetCancelRegistry(t)

	model := &stubModel{} //nolint:exhaustruct
	handle := withStubModel(t, model)

	bridgeAiGenerateText(
		handle,
		`{"requestId":"live-ctx","messages":[],"system":"","maxTokens":0,"toolChoice":""}`,
	)

	model.mu.Lock()
	err := model.ctxErr
	model.mu.Unlock()

	if err != nil {
		t.Fatalf("the provider received a dead context: %v", err)
	}
}

// closeCountingModel records how many times it was closed.
type closeCountingModel struct {
	stubModel

	closes int
}

func (m *closeCountingModel) Close(_ context.Context) error {
	m.mu.Lock()
	m.closes++
	m.mu.Unlock()

	return nil
}

func (m *closeCountingModel) closeCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()

	return m.closes
}

// TestCloseModelReleasesTheRegistryEntry pins that closing a model actually
// removes it from aiRegistry.
//
// The two identifiers differ -- AddModel is given a generated "cfg-N" name
// while the caller receives a separate "model-N" handle -- so without the
// mapping there is nothing to remove the registry entry by, and every model
// ever created stayed referenced for the process lifetime.
func TestCloseModelReleasesTheRegistryEntry(t *testing.T) {
	model := &closeCountingModel{} //nolint:exhaustruct

	registryName := newHandle("cfg")
	if _, err := aiRegistry.AddModel(
		context.Background(), registryName, testConfigTarget(),
	); err != nil {
		t.Skipf("registry rejected the test config: %v", err)
	}

	handle := newHandle("model")

	handleMu.Lock()
	modelHandles[handle] = model
	modelRegistryNames[handle] = registryName
	handleMu.Unlock()

	before := len(aiRegistry.ListModels())

	if got := bridgeAiCloseModel(handle); got != "{}" {
		t.Fatalf("close returned %q", got)
	}

	if after := len(aiRegistry.ListModels()); after >= before {
		t.Fatalf("registry still holds %d models (was %d)", after, before)
	}

	handleMu.Lock()
	_, handleLeft := modelHandles[handle]
	_, nameLeft := modelRegistryNames[handle]
	handleMu.Unlock()

	if handleLeft || nameLeft {
		t.Fatal("the handle or its registry name outlived the close")
	}
}

// TestCloseModelClosesExactlyOnce pins that a model has exactly one closer.
//
// Registry.RemoveModel closes the model itself, so closing it here as well
// closes the same object twice -- which most providers tolerate today, which is
// precisely why it would go unnoticed until one of them did not.
//
// The two cases are the two owners. With a registry name the registry owns the
// close and this path must not touch the model; without one there is no
// registry entry, so this path must close it itself. An implementation that
// does both fails the first case; one that does neither fails the second.
func TestCloseModelClosesExactlyOnce(t *testing.T) {
	t.Run("registry owns the close", func(t *testing.T) {
		model := &closeCountingModel{} //nolint:exhaustruct

		registryName := newHandle("cfg")
		if _, err := aiRegistry.AddModel(
			context.Background(), registryName, testConfigTarget(),
		); err != nil {
			t.Skipf("registry rejected the test config: %v", err)
		}

		handle := newHandle("model")

		handleMu.Lock()
		modelHandles[handle] = model
		modelRegistryNames[handle] = registryName
		handleMu.Unlock()

		bridgeAiCloseModel(handle)

		if got := model.closeCount(); got != 0 {
			t.Fatalf(
				"the handle's model was closed %d times on the registry path; "+
					"RemoveModel already closes it, so this is a double close",
				got,
			)
		}
	})

	t.Run("fallback owns the close", func(t *testing.T) {
		model := &closeCountingModel{} //nolint:exhaustruct

		handle := newHandle("model")

		handleMu.Lock()
		modelHandles[handle] = model
		handleMu.Unlock()

		bridgeAiCloseModel(handle)

		if got := model.closeCount(); got != 1 {
			t.Fatalf("model was closed %d times with no registry entry, want 1", got)
		}
	})
}

// testConfigTarget is a config the registry will accept for a real provider,
// used only to occupy a registry slot the close path must free.
func testConfigTarget() *aifx.ConfigTarget {
	return &aifx.ConfigTarget{ //nolint:exhaustruct
		Provider: "anthropic",
		Model:    "claude-test",
		APIKey:   "test-key",
	}
}

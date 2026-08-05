package main

import (
	"context"
	"encoding/json"
	"sync"
)

// maxTrackedCancels bounds the in-flight request table.
//
// Entries are removed when a request ends, so this only fills with tombstones
// (see cancelAIRequest) left by a cancel that raced past its request's
// completion. Far above any real concurrency; it exists so a caller that
// cancels ids which never run cannot grow memory without limit.
const maxTrackedCancels = 4096

// aiRequest is one cancellable in-flight AI call.
type aiRequest struct {
	// cancel is nil for a tombstone: a cancellation that arrived before the
	// request registered itself.
	cancel context.CancelFunc

	// cancelled records that a cancel has been seen, so a request that
	// registers after the fact is stopped immediately rather than running on.
	cancelled bool
}

// aiCancels tracks in-flight AI calls by the request id their caller supplied.
//
// # Why a tombstone rather than just a map of cancel funcs
//
// The FFI symbols for generation run on a threadpool, so JavaScript dispatches
// the call and only then attaches its abort listener. An AbortSignal that is
// already aborted, or that fires immediately, therefore reaches Go before the
// request has registered anything to cancel. Dropping that cancel would make
// abort silently unreliable in exactly the case it is easiest to write:
//
//	const c = new AbortController();
//	const p = model.generateText(opts, c.signal);
//	c.abort();                       // arrives first
//
// So a cancel for an unknown id records a tombstone, and the request consumes
// it when it registers -- cancelling before any provider work begins.
var (
	aiCancelMu sync.Mutex
	aiCancels  = make(map[string]*aiRequest) //nolint:gochecknoglobals
)

// beginAIRequest registers cancel under requestID and reports whether the
// request may proceed.
//
// A false return means a cancellation is already waiting: the caller must not
// start the work. cancel is invoked before returning, so the context is dead
// either way.
func beginAIRequest(requestID string, cancel context.CancelFunc) bool {
	if requestID == "" {
		return true
	}

	aiCancelMu.Lock()
	defer aiCancelMu.Unlock()

	if existing, ok := aiCancels[requestID]; ok && existing.cancelled {
		// A tombstone: cancelled before we got here. Consume it.
		delete(aiCancels, requestID)
		cancel()

		return false
	}

	aiCancels[requestID] = &aiRequest{cancel: cancel, cancelled: false}

	return true
}

// endAIRequest forgets a request. Idempotent, so the defer that calls it is
// safe alongside a cancel that already removed the entry.
func endAIRequest(requestID string) {
	if requestID == "" {
		return
	}

	aiCancelMu.Lock()
	delete(aiCancels, requestID)
	aiCancelMu.Unlock()
}

// cancelAIRequest stops an in-flight request, or leaves a tombstone for one
// that has not registered yet.
//
// Reports whether anything was cancelled; false means only a tombstone was
// left, which is not an error -- it is the early-abort case.
func cancelAIRequest(requestID string) bool {
	if requestID == "" {
		return false
	}

	aiCancelMu.Lock()
	defer aiCancelMu.Unlock()

	if existing, ok := aiCancels[requestID]; ok {
		existing.cancelled = true

		if existing.cancel != nil {
			existing.cancel()
			delete(aiCancels, requestID)

			return true
		}

		return false
	}

	// Over the cap, drop the tombstone rather than grow. The consequence is
	// that this one early cancel is missed -- the same outcome as before
	// cancellation existed at all -- rather than an unbounded table.
	if len(aiCancels) >= maxTrackedCancels {
		return false
	}

	aiCancels[requestID] = &aiRequest{cancel: nil, cancelled: true}

	return false
}

// beginCancellable opens a request's context and registers it for cancellation.
//
// It is the whole protocol in one place: create the context, register it before
// any work starts, report whether a cancellation was already waiting, and hand
// back the cleanup. Every AI entry point that can block on a provider uses it,
// so none of them can implement three of the four steps and quietly skip the
// fourth.
//
// Usage is fixed, and the order matters -- done must be deferred before the ok
// check, or a refused request leaks its registration:
//
//	ctx, done, ok := beginCancellable(req.RequestID)
//	defer done()
//
//	if !ok {
//		return errorResponse("batch get cancelled: " + context.Canceled.Error())
//	}
//
// An empty requestID means the caller did not ask for cancellation: the work
// still runs, just uncancellably.
func beginCancellable(requestID string) (context.Context, func(), bool) {
	ctx, cancel := context.WithCancel(context.Background())

	if !beginAIRequest(requestID, cancel) {
		return ctx, cancel, false
	}

	done := func() {
		endAIRequest(requestID)
		cancel()
	}

	return ctx, done, true
}

// aiCancelRequest is the cancel symbol's payload.
type aiCancelRequest struct {
	RequestID string `json:"requestId"`
}

// bridgeAiCancelRequest serves the cancel symbol.
func bridgeAiCancelRequest(requestJSON string) string {
	var req aiCancelRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return errorResponse("invalid cancel request: " + err.Error())
	}

	cancelAIRequest(req.RequestID)

	// Always success. "Nothing to cancel" is the normal outcome of a request
	// that finished a moment earlier, and reporting it as an error would make
	// every well-behaved caller log a failure on the happy path.
	return `{}`
}

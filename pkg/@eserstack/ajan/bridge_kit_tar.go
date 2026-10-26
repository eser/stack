// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"sync"

	"github.com/eser/stack/pkg/ajan/kitfx"
)

// ---------------------------------------------------------------------------
// Kit tarball extraction bridge (push-fed stream)
// ---------------------------------------------------------------------------
//
// kitExtractTarballStream runs kitfx.ExtractTarball on a gzipped tar archive
// that the host pushes in chunks through kitExtractTarballStreamPush, so a
// download is extracted while it arrives and stops at the first limit. The
// extractor runs in its own goroutine and reads the chunks through a
// tarballFeed; every push waits until the extractor has used up its chunk and
// asks for the next one, or has finished. A push answer therefore reports a
// limit or a broken archive as soon as the bytes that show it are in, even
// while the host's download is still open.

// errTarballFeedClosed ends an extraction whose stream the host closed before
// the archive was complete.
var errTarballFeedClosed = errors.New("extract tarball: the stream was closed before the archive ended")

// tarballChunk is one push: its bytes, or the end of the archive.
type tarballChunk struct {
	data   []byte
	end    bool
	closed bool
}

// tarballFeed hands the pushed chunks to the extractor goroutine. Read sends
// on hungry when it has no bytes left and then waits on chunks; done closes
// when the extractor returns, with its result in err.
type tarballFeed struct {
	chunks  chan tarballChunk
	hungry  chan struct{}
	done    chan struct{}
	err     error
	pending []byte
	ended   bool
	closed  bool
}

func (f *tarballFeed) Read(buf []byte) (int, error) {
	for len(f.pending) == 0 {
		if f.closed {
			return 0, errTarballFeedClosed
		}

		if f.ended {
			return 0, io.EOF
		}

		f.hungry <- struct{}{}

		chunk := <-f.chunks
		f.pending = chunk.data
		f.ended = chunk.end
		f.closed = chunk.closed
	}

	n := copy(buf, f.pending)
	f.pending = f.pending[n:]

	return n, nil
}

// tarballExtraction is one open kitExtractTarballStream handle. mu serializes
// the pushes and the close on it; finished is set once done has closed.
type tarballExtraction struct {
	feed     *tarballFeed
	mu       sync.Mutex
	finished bool
}

// await blocks until the extractor asks for more input or finishes, and
// reports whether it finished.
func (e *tarballExtraction) await() bool {
	if e.finished {
		return true
	}

	select {
	case <-e.feed.hungry:
		return false
	case <-e.feed.done:
		e.finished = true

		return true
	}
}

// send hands one chunk to the waiting extractor and waits for it to use the
// chunk up; it reports whether the extractor finished.
func (e *tarballExtraction) send(chunk tarballChunk) bool {
	if e.finished {
		return true
	}

	e.feed.chunks <- chunk

	return e.await()
}

// Open extraction handles, guarded by handleMu.
var tarballExtractions = make(map[string]*tarballExtraction) //nolint:gochecknoglobals

type kitExtractTarballRequest struct {
	Dir             string `json:"dir"`
	Subpath         string `json:"subpath,omitempty"`
	StripComponents int    `json:"stripComponents,omitempty"`
	MaxBytes        int64  `json:"maxBytes,omitempty"`
	MaxEntries      int    `json:"maxEntries,omitempty"`
}

type kitExtractTarballPushRequest struct {
	Handle string `json:"handle"`
	// Chunk is the next bytes of the gzipped archive, base64-encoded.
	Chunk string `json:"chunk,omitempty"`
	// End marks the end of the archive; Chunk may still carry its last bytes.
	End bool `json:"end,omitempty"`
}

// kitExtractTarballAnswer answers the open, every push and the close. Done is
// true once the extraction finished without error. A limit error names the
// limit and its value, as kitfx.TarballLimitError does.
type kitExtractTarballAnswer struct {
	Handle string `json:"handle,omitempty"`
	Error  string `json:"error,omitempty"`
	Limit  string `json:"limit,omitempty"`
	Max    int64  `json:"max,omitempty"`
	Done   bool   `json:"done,omitempty"`
}

// finalAnswer is the answer of an extraction that has finished.
func (e *tarballExtraction) finalAnswer() kitExtractTarballAnswer {
	err := e.feed.err
	if err == nil {
		return kitExtractTarballAnswer{Done: true} //nolint:exhaustruct
	}

	answer := kitExtractTarballAnswer{Error: err.Error()} //nolint:exhaustruct
	if limitErr, ok := errors.AsType[*kitfx.TarballLimitError](err); ok {
		answer.Limit = limitErr.Limit
		answer.Max = limitErr.Max
	}

	return answer
}

// bridgeKitExtractTarballOpen starts an extraction into req.Dir and answers
// its handle once the extractor waits for the first chunk.
func bridgeKitExtractTarballOpen(requestJSON string) string {
	var req kitExtractTarballRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitExtractTarballAnswer{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	if req.Dir == "" {
		return marshalResponse(kitExtractTarballAnswer{Error: "extract tarball: dir is required"}) //nolint:exhaustruct
	}

	feed := &tarballFeed{ //nolint:exhaustruct
		chunks: make(chan tarballChunk),
		hungry: make(chan struct{}),
		done:   make(chan struct{}),
	}

	go func() {
		defer close(feed.done)

		defer func() {
			if recovered := recover(); recovered != nil {
				feed.err = errors.New(reportPanic(recovered))
			}
		}()

		feed.err = kitfx.ExtractTarball(feed, req.Dir, kitfx.ExtractOptions{
			StripComponents: req.StripComponents,
			Subpath:         req.Subpath,
			MaxBytes:        req.MaxBytes,
			MaxEntries:      req.MaxEntries,
		})
	}()

	extraction := &tarballExtraction{feed: feed} //nolint:exhaustruct
	if extraction.await() {
		// It ended before reading anything, which ExtractTarball does only
		// for invalid options.
		return marshalResponse(extraction.finalAnswer())
	}

	handle := newHandle("kittar")

	handleMu.Lock()
	tarballExtractions[handle] = extraction
	handleMu.Unlock()

	return marshalResponse(kitExtractTarballAnswer{Handle: handle}) //nolint:exhaustruct
}

// bridgeKitExtractTarballPush feeds one chunk to an extraction. It answers
// {} while the extractor wants more input, {done: true} once the archive is
// extracted, or the error that stopped it.
func bridgeKitExtractTarballPush(requestJSON string) string {
	var req kitExtractTarballPushRequest
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitExtractTarballAnswer{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	data, err := base64.StdEncoding.DecodeString(req.Chunk)
	if err != nil {
		return marshalResponse(kitExtractTarballAnswer{Error: "invalid base64 in chunk: " + err.Error()}) //nolint:exhaustruct
	}

	handleMu.RLock()
	extraction, ok := tarballExtractions[req.Handle]
	handleMu.RUnlock()

	if !ok {
		return marshalResponse(kitExtractTarballAnswer{Error: "unknown tarball extraction handle: " + req.Handle}) //nolint:exhaustruct
	}

	extraction.mu.Lock()
	defer extraction.mu.Unlock()

	if !extraction.send(tarballChunk{data: data, end: req.End, closed: false}) {
		return marshalResponse(kitExtractTarballAnswer{}) //nolint:exhaustruct
	}

	return marshalResponse(extraction.finalAnswer())
}

// stopExtraction ends a running extraction, which then fails with
// errTarballFeedClosed, and waits for its goroutine.
func stopExtraction(extraction *tarballExtraction) {
	extraction.mu.Lock()
	defer extraction.mu.Unlock()

	extraction.send(tarballChunk{data: nil, end: false, closed: true})
}

// bridgeKitExtractTarballClose releases a handle. An extraction still waiting
// for input stops; nothing is written after close answers. The answer is the
// extraction's result: {done: true}, its error, or the error of a stream
// closed early.
func bridgeKitExtractTarballClose(requestJSON string) string {
	var req struct {
		Handle string `json:"handle"`
	}
	if err := json.Unmarshal([]byte(requestJSON), &req); err != nil {
		return marshalResponse(kitExtractTarballAnswer{Error: "invalid request JSON: " + err.Error()}) //nolint:exhaustruct
	}

	handleMu.Lock()
	extraction, ok := tarballExtractions[req.Handle]
	delete(tarballExtractions, req.Handle)
	handleMu.Unlock()

	// Closing an unknown or already-closed handle succeeds: close is
	// idempotent across every handle kind in this bridge.
	if !ok {
		return marshalResponse(kitExtractTarballAnswer{}) //nolint:exhaustruct
	}

	stopExtraction(extraction)

	return marshalResponse(extraction.finalAnswer())
}

// drainTarballExtractions stops every running extraction at shutdown.
func drainTarballExtractions() shutdownStep {
	handleMu.Lock()
	extractions := make([]*tarballExtraction, 0, len(tarballExtractions))
	for _, extraction := range tarballExtractions {
		extractions = append(extractions, extraction)
	}

	clear(tarballExtractions)
	handleMu.Unlock()

	return shutdownStep{ //nolint:exhaustruct
		release: func() {
			for _, extraction := range extractions {
				stopExtraction(extraction)
			}
		},
	}
}

func init() {
	registerShutdownDrain(drainTarballExtractions)

	// Push-fed: chunks go in through kitExtractTarballStreamPush, which
	// answers the extraction's progress, and close releases the handle.
	registerStream("kitExtractTarballStream", "kittar", streamFuncs{
		open:  bridgeKitExtractTarballOpen,
		read:  nil,
		close: func(handle string) string { return bridgeKitExtractTarballClose(handleRequest(handle)) },
	})
	register("kitExtractTarballStreamPush", bridgeKitExtractTarballPush)
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"context"
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

// discardFrontend encodes every message as a remote transport would and
// throws the bytes away, so a benchmark counts the JSON encoding too.
func discardFrontend(b *testing.B) func(msg muxfx.ServerToFrontend) {
	b.Helper()

	encoder := json.NewEncoder(io.Discard)

	return func(msg muxfx.ServerToFrontend) {
		if err := encoder.Encode(msg); err != nil {
			b.Errorf("encode %s: %v", msg.T, err)
		}
	}
}

// BenchmarkScreenStream streams coloured log output through a pane on a fake
// host, in 4 KiB chunks with a frame interval every 16 of them (a program
// writing 4 MB/s), to a frontend on screen messages: what emulating the pane
// and sending its screens costs.
func BenchmarkScreenStream(b *testing.B) {
	const (
		chunkSize      = 4 << 10
		chunksPerFrame = 16
		streamBytes    = 8 << 20
	)

	chunks := make([][]byte, streamBytes/chunkSize)
	for i := range chunks {
		chunks[i] = streamChunk(i, chunkSize)[:chunkSize]
	}

	host := &fakeHost{}
	clock := newFakeClock()
	server := muxfx.NewServer(&muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: 120, Rows: 40}),
		ResolveSpawn: func(*muxfx.Pane, muxfx.Geom) muxfx.SpawnSpec { return muxfx.SpawnSpec{Command: "cat"} },
		NewHost:      host.factory,
		Clock:        clock,
	})

	b.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := server.Dispose(ctx); err != nil {
			b.Errorf("dispose: %v", err)
		}
	})

	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
	frontendSide.OnMessage(discardFrontend(b))
	server.Connect(serverSide)
	server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})
	frontendSide.Send(muxfx.FrontendToServer{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 120, Rows: 40}})

	pane := host.spawned[0]

	b.SetBytes(streamBytes)
	b.ReportAllocs()

	for b.Loop() {
		for i, chunk := range chunks {
			// OnData owns its slice, as the PTY host's reader hands
			// over a fresh one.
			host.cb.OnData(pane, append([]byte(nil), chunk...))

			if i%chunksPerFrame == chunksPerFrame-1 {
				clock.Advance(muxfx.ScreenFrameInterval)
			}
		}
	}
}

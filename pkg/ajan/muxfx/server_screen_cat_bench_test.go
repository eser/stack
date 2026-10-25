// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package muxfx_test

import (
	"context"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/muxfx"
)

// catCPUBudget is the most CPU time the server may spend per MiB a pane
// streams through cat to a screen frontend: emulating the pane, building the
// screen messages and encoding them as JSON. The measured cost on an Apple M4
// Max with Go 1.26 is in the muxfx README; the budget leaves room for slower
// machines.
const catCPUBudget = 80 * time.Millisecond

func processCPU(b *testing.B) time.Duration {
	b.Helper()

	var usage syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_SELF, &usage); err != nil {
		b.Fatalf("getrusage: %v", err)
	}

	return time.Duration(usage.Utime.Nano() + usage.Stime.Nano())
}

// BenchmarkScreenCatLargeFile runs cat on a 32 MiB coloured log in a real
// pane and reports the CPU time this process spent per MiB (cat's own time
// is its own), for a frontend on screen messages. It fails when the cost
// exceeds catCPUBudget.
func BenchmarkScreenCatLargeFile(b *testing.B) {
	const fileBytes = 32 << 20

	path := filepath.Join(b.TempDir(), "stream.log")

	data := make([]byte, 0, fileBytes+(8<<10))
	for i := 0; len(data) < fileBytes; i++ {
		data = append(data, streamChunk(i, 8<<10)...)
	}

	if err := os.WriteFile(path, data, 0o600); err != nil {
		b.Fatalf("write the file: %v", err)
	}

	mib := float64(len(data)) / (1 << 20)

	var spent time.Duration

	for b.Loop() {
		spent += catOnce(b, path)
	}

	perMiB := time.Duration(float64(spent) / float64(b.N) / mib)
	b.ReportMetric(float64(perMiB)/float64(time.Millisecond), "cpu-ms/MiB")

	if perMiB > catCPUBudget {
		b.Errorf("CPU per MiB = %v, budget %v", perMiB, catCPUBudget)
	}
}

// catOnce streams the file through cat in a fresh server and returns the
// CPU time the process spent until the pane exited.
func catOnce(b *testing.B, path string) time.Duration {
	b.Helper()

	exited := make(chan struct{})
	server := muxfx.NewServer(&muxfx.ServerOptions{
		InitialState: muxfx.NewInitialState(muxfx.Viewport{Cols: 120, Rows: 40}),
		ResolveSpawn: func(*muxfx.Pane, muxfx.Geom) muxfx.SpawnSpec {
			return muxfx.SpawnSpec{Command: "/bin/cat", Args: []string{path}}
		},
		KeepEmptySession: true,
		OnPaneExit:       func(muxfx.PaneID) { close(exited) },
	})

	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := server.Dispose(ctx); err != nil {
			b.Errorf("dispose: %v", err)
		}
	}()

	serverSide, frontendSide := muxfx.NewInProcessPair[muxfx.ServerToFrontend, muxfx.FrontendToServer]()
	frontendSide.OnMessage(discardFrontend(b))
	server.Connect(serverSide)
	frontendSide.Send(muxfx.FrontendToServer{T: muxfx.MessageAttach, Viewport: &muxfx.Viewport{Cols: 120, Rows: 40}})

	start := processCPU(b)

	server.Dispatch(&muxfx.Action{Type: muxfx.ActionNewTab})

	select {
	case <-exited:
	case <-time.After(time.Minute):
		b.Fatal("cat did not finish within a minute")
	}

	return processCPU(b) - start
}

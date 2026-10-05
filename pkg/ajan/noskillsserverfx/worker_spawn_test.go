package noskillsserverfx

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// echoWorkerScript speaks the mux worker's socket protocol: it reports ready,
// answers every message with an echo event, and exits on shutdown or when the
// daemon closes the socket. It is plain JavaScript with node: builtins, so
// whichever runtime workerRuntime picks can run it.
const echoWorkerScript = `import net from "node:net";
import process from "node:process";

const socket = net.createConnection({ path: process.argv[process.argv.length - 1] });
socket.setEncoding("utf8");
socket.on("connect", () => socket.write(JSON.stringify({ type: "ready" }) + "\n"));

let buffered = "";
socket.on("data", (chunk) => {
  buffered += chunk;
  for (let end = buffered.indexOf("\n"); end >= 0; end = buffered.indexOf("\n")) {
    const message = JSON.parse(buffered.slice(0, end));
    buffered = buffered.slice(end + 1);
    if (message.type === "shutdown") {
      process.exit(0);
    }
    socket.write(JSON.stringify({ type: "echo", of: message.type }) + "\n");
  }
});
socket.on("close", () => process.exit(0));
`

// silentWorkerScript starts and never connects, like a worker stuck before
// its handshake.
const silentWorkerScript = `setTimeout(() => {}, 60_000);
`

// newMuxWorkerDir returns a short data directory holding script as the worker.
// The worker's unix socket lives under the directory, and macOS limits socket
// paths to 104 bytes, which t.TempDir() can exceed.
func newMuxWorkerDir(t *testing.T, script string) (string, string) {
	t.Helper()

	if _, _, err := workerRuntime("", ""); err != nil {
		t.Fatalf("mux workers need a JavaScript runtime on PATH: %v", err)
	}

	dataDir, err := os.MkdirTemp("", "nsw")
	if err != nil {
		t.Fatalf("create data dir: %v", err)
	}

	t.Cleanup(func() {
		if removeErr := os.RemoveAll(dataDir); removeErr != nil {
			t.Errorf("remove data dir: %v", removeErr)
		}
	})

	scriptPath := filepath.Join(dataDir, "worker.mjs")
	if err := os.WriteFile(scriptPath, []byte(script), 0o600); err != nil {
		t.Fatalf("write worker script: %v", err)
	}

	return dataDir, scriptPath
}

// TestMuxWorkerSpawnEndsWithTheRequest pins that the request bounds the
// handshake: a worker that never connects is abandoned when the request ends,
// not after the 30s accept deadline.
func TestMuxWorkerSpawnEndsWithTheRequest(t *testing.T) {
	t.Parallel()

	dataDir, script := newMuxWorkerDir(t, silentWorkerScript)

	requestCtx, cancel := context.WithTimeout(t.Context(), 300*time.Millisecond)
	defer cancel()

	started := time.Now()

	worker, err := SpawnWorker(requestCtx, "s1", dataDir, dataDir, script, WorkerKindMux,
		logfx.NewLogger(logfx.WithWriter(io.Discard)))
	elapsed := time.Since(started)

	if err == nil {
		_ = worker.Close() // the assertion below has already failed
		t.Fatal("SpawnWorker() with a worker that never connects = nil error")
	}

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("SpawnWorker() = %v, want the request's deadline", err)
	}

	if elapsed > 10*time.Second {
		t.Errorf("SpawnWorker() returned after %v, want soon after the 300ms request deadline", elapsed)
	}
}

// TestMuxWorkerOutlivesTheSpawningRequest pins that the mux worker process
// belongs to its session: the attach request that spawned it can end without
// taking the worker, and the terminals it hosts, with it. Only Close ends it.
func TestMuxWorkerOutlivesTheSpawningRequest(t *testing.T) {
	t.Parallel()

	dataDir, script := newMuxWorkerDir(t, echoWorkerScript)

	requestCtx, endRequest := context.WithCancel(t.Context())

	worker, err := SpawnWorker(requestCtx, "s1", dataDir, dataDir, script, WorkerKindMux,
		logfx.NewLogger(logfx.WithWriter(io.Discard)))
	if err != nil {
		t.Fatalf("SpawnWorker() = %v", err)
	}

	endRequest() // the client that attached first goes away

	if err := worker.PushMessage(t.Context(), "still there?"); err != nil {
		t.Fatalf("PushMessage() after the spawning request ended = %v", err)
	}

	select {
	case evt, open := <-worker.Events():
		if !open {
			t.Fatal("the worker exited when the request that spawned it ended")
		}

		if evt.Type != "echo" {
			t.Errorf("worker event = %q, want %q", evt.Type, "echo")
		}
	case <-time.After(10 * time.Second):
		t.Fatal("no reply from the worker within 10s")
	}

	if err := worker.Close(); err != nil {
		t.Fatalf("Close() = %v, want nil", err)
	}

	// Close ends the process, and the events channel closes once it is gone.
	timeout := time.After(10 * time.Second)

	for {
		select {
		case _, open := <-worker.Events():
			if !open {
				return
			}
		case <-timeout:
			t.Fatal("the worker's events channel stayed open 10s after Close")
		}
	}
}

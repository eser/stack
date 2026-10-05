package noskillsserverfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/processfx"
)

// ── Wire types ────────────────────────────────────────────────────────────────

// WorkerEvent is emitted on the Events() channel for each message from the worker.
type WorkerEvent struct {
	Type    string
	Payload []byte // raw JSON of the entire message
}

// Worker flavours accepted by SpawnWorker and by the ?kind= attach parameter.
const (
	// WorkerKindAgent is an agent session. It is also the zero value: an unset
	// kind means this one.
	//
	// It is served by the ACP worker. "agent" and "acp" name the same thing;
	// both are accepted because clients and stored sessions carry either
	// string.
	WorkerKindAgent = "agent"

	// WorkerKindMux is the terminal-multiplexer worker.
	WorkerKindMux = "mux"

	// WorkerKindACP is an explicit spelling of WorkerKindAgent.
	WorkerKindACP = "acp"
)

// ── Interface ─────────────────────────────────────────────────────────────────

// WorkerHandle is the daemon-side handle to a running TS worker process.
//
// Every method that sends to the worker takes the caller's ctx. A send that
// can block (the mux worker's socket writes) does not start once ctx has
// ended, and it ends by ctx's deadline or after workerWriteTimeout, whichever
// is sooner. A worker that stops reading therefore cannot hold the
// WebTransport read loop that also carries the client's stop.
type WorkerHandle interface {
	// SendQueryStart sends the initial query_start message to the worker.
	SendQueryStart(ctx context.Context, cwd, sessionID string, resume string) error
	// PushMessage pushes a user message into the running query.
	PushMessage(ctx context.Context, content string) error
	// PermissionResponse resolves a pending canUseTool request.
	PermissionResponse(ctx context.Context, requestID, behavior, message string) error
	// SendMux relays a raw mux frontend frame (a {"t":...} object) to a mux
	// worker. No-op semantics for agent workers (they ignore unknown messages).
	SendMux(ctx context.Context, frame json.RawMessage) error
	// SetMode switches the session's mode, e.g. plan vs edit. Workers that have
	// no mode concept return nil rather than an error: the client's request was
	// well-formed and there is nothing to fail. ctx bounds the call.
	SetMode(ctx context.Context, mode string) error
	// StopTask asks the worker to abort the current task gracefully. ctx
	// bounds the call.
	StopTask(ctx context.Context) error
	// Close tears down the worker process.
	Close() error
	// Events returns a channel of worker-to-daemon messages.
	Events() <-chan WorkerEvent
	// SessionID returns the session this handle is bound to.
	SessionID() string
}

// Compile-time interface assertions.
//
// Without these an implementation that falls behind the interface fails only
// where it is assigned -- one line in sessions.go for the real worker, and a
// test file for the mock. Naming them here makes an interface change point at
// every implementation that has to follow it.
var (
	_ WorkerHandle = (*workerImpl)(nil)
	_ WorkerHandle = (*acpWorker)(nil)
	_ WorkerHandle = (*MockWorkerHandle)(nil)
)

// ── Spawning ──────────────────────────────────────────────────────────────────

// ErrWorkerRuntimeMissing is returned when no JavaScript runtime can run the
// mux worker.
var ErrWorkerRuntimeMissing = errors.New("worker: no javascript runtime found")

// workerRuntime picks a JavaScript runtime to run the worker under.
//
// Any of the three will do. The worker imports node: builtins plus workspace
// packages by bare specifier, which resolve to .ts sources -- Deno and Bun both
// execute that directly, and Node needs a TypeScript loader. Nothing about the
// worker is Deno-specific.
//
// All three run the file as written: Deno and Bun execute TypeScript natively,
// and Node >= 26 strips types on its own (which is why the engines floor is 26,
// and why the few parameter properties in this workspace were converted to
// explicit assignments -- strip-only mode cannot emit the assignment a
// parameter property implies). NOSKILLS_WORKER_RUNTIME overrides the search.
func workerRuntime(workerPath, sockPath string) (string, []string, error) {
	if forced := os.Getenv(envWorkerRuntime); forced != "" {
		switch forced {
		case "deno":
			return "deno", []string{"run", "-A", workerPath, sockPath}, nil
		case "bun":
			return "bun", []string{"run", workerPath, sockPath}, nil
		case "node":
			return "node", []string{workerPath, sockPath}, nil
		default:
			return "", nil, fmt.Errorf(
				"%w: %s=%q (expected deno, bun or node)",
				ErrWorkerRuntimeMissing, envWorkerRuntime, forced,
			)
		}
	}

	if _, err := exec.LookPath("deno"); err == nil {
		return "deno", []string{"run", "-A", workerPath, sockPath}, nil
	}

	if _, err := exec.LookPath("bun"); err == nil {
		return "bun", []string{"run", workerPath, sockPath}, nil
	}

	if _, err := exec.LookPath("node"); err == nil {
		return "node", []string{workerPath, sockPath}, nil
	}

	return "", nil, fmt.Errorf(
		"%w: install deno, bun or node (set %s to choose one explicitly)",
		ErrWorkerRuntimeMissing, envWorkerRuntime,
	)
}

// SpawnWorker creates a Unix socket listener, spawns the worker process, waits
// for "ready", and returns a WorkerHandle. Returns when the worker is ready to
// accept query_start.
//
// kind selects the worker flavour: "mux" runs the terminal-multiplexer worker
// (mux-worker.ts under Deno, which resolves @eserstack/mux's workspace
// imports); anything else -- "", "agent", "acp" -- drives an Agent Client
// Protocol agent directly from Go, with no TypeScript worker in between.
func SpawnWorker(
	ctx context.Context,
	sessionID, cwd, dataDir, workerPath, kind string,
	logger *logfx.Logger,
) (WorkerHandle, error) {
	// Every agent session is an ACP session now. The ACP path shares none of the
	// socket handshake below: the protocol is the transport, so there is no
	// listener, no ready message and no worker script to resolve.
	//
	// Only mux still needs a TypeScript worker, because a terminal pane's
	// content channel is VT bytes rather than protocol messages.
	if kind != WorkerKindMux {
		return spawnACPWorker(ctx, sessionID, cwd, dataDir, logger)
	}

	// Only the mux worker needs a script on disk, so path resolution collapses
	// to it.
	if workerPath == "" {
		if override := os.Getenv("NOSKILLS_MUX_WORKER_PATH"); override != "" {
			workerPath = override
		} else {
			exe, err := os.Executable()
			if err != nil {
				return nil, fmt.Errorf(
					"locate mux-worker.ts beside the daemon binary: %w (set NOSKILLS_MUX_WORKER_PATH)", err,
				)
			}

			workerPath = filepath.Join(filepath.Dir(exe), "mux-worker.ts")
		}
	}

	runtimeDir := filepath.Join(dataDir, "runtime")
	if err := os.MkdirAll(runtimeDir, 0o700); err != nil {
		return nil, fmt.Errorf("mkdir runtime: %w", err)
	}

	sockPath := filepath.Join(runtimeDir, sessionID+".sock")
	_ = os.Remove(sockPath) //nolint:gosec // sockPath is dataDir/runtime/{sid}.sock, not user input

	listener, err := net.Listen("unix", sockPath)
	if err != nil {
		return nil, fmt.Errorf("listen unix socket: %w", err)
	}

	defer func() {
		// Listener is only used to accept the single initial connection.
		_ = listener.Close()
	}()

	runCmd, runArgs, runErr := workerRuntime(workerPath, sockPath)
	if runErr != nil {
		return nil, runErr
	}

	// The process belongs to the session, not to the attach request that
	// spawned it: a client that disconnects must not take the session's
	// terminals with it. Its context keeps ctx's values, drops its
	// cancellation, and ends only through Close. HardenCommand makes that end
	// kill the whole process group.
	processCtx, stopProcess := context.WithCancel(context.WithoutCancel(ctx))

	cmd := exec.CommandContext(processCtx, runCmd, runArgs...) //nolint:gosec // G204: workerRuntime picks deno, bun or node, and the script path is daemon config, never client input
	processfx.HardenCommand(cmd)
	cmd.Dir = cwd
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		stopProcess()

		return nil, fmt.Errorf("spawn worker: %w", err)
	}

	// Until the worker is ready, ctx bounds the spawn: its end kills the
	// process, which ends the wait for ready, and closes the listener, which
	// ends the accept.
	stopSpawnWatch := context.AfterFunc(ctx, func() {
		stopProcess()
		_ = listener.Close() // ends the accept; the deferred Close reports nothing new
	})

	// abort ends a worker that never became ready and reaps its process.
	abort := func() {
		stopSpawnWatch()
		stopProcess()
		_ = cmd.Wait() // the process was killed; its exit status says nothing new
	}

	// Accept the worker's connection (with timeout).
	deadline := time.Now().Add(30 * time.Second)
	if err := listener.(*net.UnixListener).SetDeadline(deadline); err != nil { //nolint:forcetypeassert
		abort()

		return nil, fmt.Errorf("set accept deadline: %w", err)
	}

	conn, err := listener.Accept()
	if err != nil {
		abort()

		if ctx.Err() != nil {
			return nil, fmt.Errorf("accept worker connection: %w", ctx.Err())
		}

		return nil, fmt.Errorf("accept worker connection: %w", err)
	}

	w := newMuxWorker(sessionID, conn, stopProcess)

	// Wait for "ready" message.
	if err := w.waitForReady(ctx); err != nil {
		_ = conn.Close() // the worker is being killed; nothing reads the socket any more
		abort()

		return nil, fmt.Errorf("worker did not send ready: %w", err)
	}

	if !stopSpawnWatch() {
		// ctx ended just as the worker became ready, and the watch has already
		// started killing it.
		_ = conn.Close() // as above
		abort()

		return nil, fmt.Errorf("spawn worker: %w", ctx.Err())
	}

	// processCtx carries the spawning request's ids into the log entries.
	w.run(processCtx, logger, func() error {
		if err := cmd.Wait(); err != nil {
			return fmt.Errorf("mux worker process: %w", err)
		}

		return nil
	})

	return w, nil
}

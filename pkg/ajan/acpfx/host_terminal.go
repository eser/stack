package acpfx

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"sync"
	"unicode/utf8"

	"github.com/eser/stack/pkg/ajan/shellfx/exec"
)

// terminal is one command run on the agent's behalf.
type terminal struct {
	proc *exec.ChildProcessHandle

	// done closes once the output pump has drained every chunk and the process
	// is reaped.
	//
	// proc.Exited() alone is not enough: shellfx closes it before closing the
	// output channel, so a status read gated on it can report a finished
	// command whose last lines are still sitting in the buffer. This is the
	// same barrier-through-the-queue shape Prompt uses for transcripts.
	done chan struct{}

	sessionID string
	id        string
	limit     int

	mu        sync.Mutex
	output    []byte
	truncated bool

	// killed records that we ended the process, which is the only case where
	// we can name the signal: shellfx reduces a wait status to an exit code, so
	// a process signalled by anyone else is indistinguishable from one whose
	// status could not be read at all.
	killed bool
}

// pump accumulates output until the process ends.
func (t *terminal) pump() {
	defer close(t.done)

	for {
		chunk, ok := t.proc.Read()
		if !ok {
			return
		}

		t.append(chunk.Data)
	}
}

// append adds output, discarding from the front to stay within the limit.
func (t *terminal) append(data []byte) {
	t.mu.Lock()
	defer t.mu.Unlock()

	t.output = append(t.output, data...)

	if len(t.output) <= t.limit {
		return
	}

	t.truncated = true

	cut := len(t.output) - t.limit

	// Advance past continuation bytes so what remains still starts on a
	// character boundary. The spec requires the retained output stay valid even
	// when that means keeping slightly less than the limit -- a UTF-8 sequence
	// sliced in half would corrupt the first line the agent reads back.
	for cut < len(t.output) && !utf8.RuneStart(t.output[cut]) {
		cut++
	}

	t.output = append(t.output[:0], t.output[cut:]...)
}

// snapshot returns the retained output and whether anything was discarded.
func (t *terminal) snapshot() (string, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()

	return string(t.output), t.truncated
}

// status reports how the command ended, or nil while it is still running.
func (t *terminal) status() *TerminalExitStatus {
	select {
	case <-t.done:
	default:
		return nil
	}

	// A real exit code wins over the kill flag: a process that exited on its
	// own microseconds before terminal/kill arrived did not die by signal, and
	// reporting SIGKILL would hide the status the agent is waiting to read.
	if code := t.proc.ExitCode(); code >= 0 {
		return &TerminalExitStatus{ExitCode: &code, Signal: nil}
	}

	t.mu.Lock()
	killed := t.killed
	t.mu.Unlock()

	if killed {
		signal := "SIGKILL"

		return &TerminalExitStatus{ExitCode: nil, Signal: &signal}
	}

	// shellfx reports -1 for any ending it could not reduce to an exit code.
	// Passing that through would be both a lie and a schema violation --
	// exitCode is an unsigned integer. Null on both fields is the honest
	// encoding of "it is over and we do not know how".
	return &TerminalExitStatus{ExitCode: nil, Signal: nil}
}

// ---------------------------------------------------------------------------
// terminal/*
// ---------------------------------------------------------------------------

// CreateTerminal serves terminal/create.
//
// The command runs with this process's privileges. Confining its cwd to the
// session roots is hygiene, not containment -- see the note on Host.
func (h *Host) CreateTerminal(
	_ context.Context,
	req *CreateTerminalRequest,
) (*CreateTerminalResponse, error) {
	dirs, err := h.sessionRoots(req.SessionID)
	if err != nil {
		return nil, err
	}

	cwd := dirs[0]

	if req.Cwd != "" {
		if cwd, err = h.resolve(req.SessionID, req.Cwd); err != nil {
			return nil, err
		}
	}

	limit := h.opts.OutputByteLimit
	if req.OutputByteLimit != nil && *req.OutputByteLimit > 0 {
		limit = *req.OutputByteLimit
	}

	id, err := h.reserveTerminalID(req.SessionID)
	if err != nil {
		return nil, err
	}

	proc, err := exec.SpawnChildProcess(exec.SpawnOptions{
		Command: req.Command,
		Args:    req.Args,
		Cwd:     cwd,
		Env:     mergeEnv(req.Env),
	})
	if err != nil {
		h.forgetTerminal(id)

		return nil, fmt.Errorf("terminal/create: %w", err)
	}

	term := &terminal{ //nolint:exhaustruct
		proc:      proc,
		done:      make(chan struct{}),
		sessionID: req.SessionID,
		id:        id,
		limit:     limit,
	}

	h.mu.Lock()
	h.terminals[id] = term
	h.mu.Unlock()

	go term.pump()

	return &CreateTerminalResponse{TerminalID: id}, nil
}

// reserveTerminalID allocates an id and claims a slot against MaxTerminals.
//
// The slot is claimed before the spawn so two concurrent creates cannot both
// see room for the last one.
func (h *Host) reserveTerminalID(sessionID string) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	live := 0

	for _, term := range h.terminals {
		if term.sessionID == sessionID {
			live++
		}
	}

	if live >= h.opts.MaxTerminals {
		return "", fmt.Errorf(
			"%w: %w: %d live", ErrInvalidParams, ErrTooManyTerminals, live,
		)
	}

	h.nextID++
	id := "term-" + strconv.FormatUint(h.nextID, 10)

	// Placeholder so a concurrent reserve counts this one. Replaced by the real
	// terminal once the process starts, removed by forgetTerminal if it does not.
	h.terminals[id] = &terminal{sessionID: sessionID, id: id} //nolint:exhaustruct

	return id, nil
}

func (h *Host) forgetTerminal(id string) {
	h.mu.Lock()
	delete(h.terminals, id)
	h.mu.Unlock()
}

// lookupTerminal finds a terminal belonging to the given session.
func (h *Host) lookupTerminal(sessionID string, terminalID string) (*terminal, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	term, ok := h.terminals[terminalID]

	// One error for both cases on purpose: a terminal owned by another session
	// must not be distinguishable from one that never existed, or the id space
	// becomes a probe for what else is running.
	if !ok || term.sessionID != sessionID || term.proc == nil {
		return nil, fmt.Errorf("%w: %w: %q", ErrInvalidParams, ErrNoSuchTerminal, terminalID)
	}

	return term, nil
}

// TerminalOutput serves terminal/output.
func (h *Host) TerminalOutput(
	_ context.Context,
	req *TerminalOutputRequest,
) (*TerminalOutputResponse, error) {
	term, err := h.lookupTerminal(req.SessionID, req.TerminalID)
	if err != nil {
		return nil, err
	}

	output, truncated := term.snapshot()

	return &TerminalOutputResponse{
		Output:     output,
		Truncated:  truncated,
		ExitStatus: term.status(),
	}, nil
}

// WaitForExit serves terminal/wait_for_exit.
//
// It blocks for as long as the command runs. That is the point of the method,
// so there is no timeout here: the bound is the agent's own request context,
// which dies with the connection.
func (h *Host) WaitForExit(
	ctx context.Context,
	req *WaitForTerminalExitRequest,
) (*WaitForTerminalExitResponse, error) {
	term, err := h.lookupTerminal(req.SessionID, req.TerminalID)
	if err != nil {
		return nil, err
	}

	select {
	case <-term.done:
	case <-ctx.Done():
		return nil, fmt.Errorf("terminal/wait_for_exit: %w", ctx.Err())
	}

	status := term.status()

	return &WaitForTerminalExitResponse{
		ExitCode: status.ExitCode,
		Signal:   status.Signal,
	}, nil
}

// KillTerminal serves terminal/kill.
//
// The terminal stays registered afterwards: the agent kills a command and then
// reads what it managed to print, so releasing here would throw away the output
// that explains why it had to be killed.
func (h *Host) KillTerminal(
	_ context.Context,
	req *KillTerminalRequest,
) (*KillTerminalResponse, error) {
	term, err := h.lookupTerminal(req.SessionID, req.TerminalID)
	if err != nil {
		return nil, err
	}

	term.mu.Lock()
	term.killed = true
	term.mu.Unlock()

	term.proc.Close()

	// Close kills and reaps, but the pump may still be draining buffered
	// chunks. Waiting for it is what makes a terminal/output immediately after
	// terminal/kill return the complete tail rather than a racy prefix.
	<-term.done

	return &KillTerminalResponse{}, nil
}

// ReleaseTerminal serves terminal/release.
func (h *Host) ReleaseTerminal(
	_ context.Context,
	req *ReleaseTerminalRequest,
) (*ReleaseTerminalResponse, error) {
	term, err := h.lookupTerminal(req.SessionID, req.TerminalID)
	if err != nil {
		return nil, err
	}

	h.forgetTerminal(term.id)

	// Idempotent, and a no-op beyond reaping if the command already finished.
	term.proc.Close()

	<-term.done

	return &ReleaseTerminalResponse{}, nil
}

// ReleaseAll kills every terminal the host still owns.
//
// Nothing in ACP v1 ends a session, so a client that never calls this leaks a
// process per unreleased terminal for the lifetime of the connection. Call it
// when tearing the connection down.
func (h *Host) ReleaseAll() {
	h.mu.Lock()
	live := make([]*terminal, 0, len(h.terminals))

	for id, term := range h.terminals {
		if term.proc != nil {
			live = append(live, term)
		}

		delete(h.terminals, id)
	}

	h.mu.Unlock()

	for _, term := range live {
		term.proc.Close()
		<-term.done
	}
}

// mergeEnv overlays the agent's variables onto this process's environment.
//
// Passing only the requested variables would hand the command an environment
// with no PATH, no HOME and no locale, so most of what an agent runs would fail
// and fail confusingly. os/exec keeps the last value for a duplicate key, so
// appending is what makes the agent's values win.
func mergeEnv(vars []EnvVariable) []string {
	if len(vars) == 0 {
		// Empty means "inherit" to shellfx, which is already what we want.
		return nil
	}

	merged := os.Environ()

	for _, variable := range vars {
		merged = append(merged, variable.Name+"="+variable.Value)
	}

	return merged
}

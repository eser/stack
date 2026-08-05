// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package shim

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/acpfx"
	shellexec "github.com/eser/stack/pkg/ajan/shellfx/exec"
)

// vendorInvocation is one run of a vendor CLI, described by the parts that
// actually differ between backends.
//
// Everything else -- spawning, making cancellation reach the child, judging
// whether the turn ran at all -- is shared, because each of those is a hang or
// a silent empty turn when it is got wrong, and a per-backend copy is a
// per-backend chance to get it wrong.
type vendorInvocation struct {
	// sentinel names the vendor in every error this produces.
	sentinel error

	// writeStdin delivers the prompt.
	//
	// Always stdin, never argv: argv is bounded by ARG_MAX, which is the hazard
	// every ad-hoc shell-out this migration replaces was subject to.
	writeStdin func(io.Writer) error

	// drain translates the vendor's stdout into session/update notifications.
	drain func(context.Context, io.Reader) (turnOutcome, error)

	command string
	cwd     string
	args    []string
}

// turnOutcome is what one vendor invocation produced.
type turnOutcome struct {
	reason   acpfx.StopReason
	vendorID string

	// sawResult records whether the vendor reported a terminal result event.
	// Its absence alongside a non-zero exit is what separates "the CLI failed
	// before starting" from "the turn ran and had nothing to say".
	sawResult bool
}

// newTurnOutcome is the state a turn starts in: it ended normally, the vendor
// named no session, and nothing terminal has been seen yet.
func newTurnOutcome() turnOutcome {
	return turnOutcome{reason: acpfx.StopReasonEndTurn, vendorID: "", sawResult: false}
}

// runVendorTurn spawns the CLI, feeds it the prompt, and drains its answer.
func runVendorTurn(ctx context.Context, inv vendorInvocation) (turnOutcome, error) {
	proc, err := shellexec.SpawnStreamProcess(shellexec.SpawnOptions{ //nolint:exhaustruct
		Command: inv.command,
		Args:    inv.args,
		Cwd:     inv.cwd,
	})
	if err != nil {
		return newTurnOutcome(), fmt.Errorf("%w: spawn: %w", inv.sentinel, err)
	}

	defer func() { _ = proc.Close() }()

	// Cancelling a context cannot interrupt a goroutine already blocked inside
	// read(2). Killing the child is what unblocks the drain below, so the cancel
	// path has to reach the process, not just the context.
	stopWatch := make(chan struct{})
	defer close(stopWatch)

	go func() {
		select {
		case <-ctx.Done():
			_ = proc.Close()
		case <-stopWatch:
		}
	}()

	if err := inv.writeStdin(proc.Stdin()); err != nil {
		return newTurnOutcome(), fmt.Errorf("%w: %w", inv.sentinel, err)
	}

	// The CLI ends the turn on stdin EOF. Without this it waits for more input
	// and the turn never completes.
	if err := proc.CloseStdin(); err != nil {
		return newTurnOutcome(), fmt.Errorf("%w: close stdin: %w", inv.sentinel, err)
	}

	outcome, err := inv.drain(ctx, proc.Stdout())
	if err != nil {
		return outcome, fmt.Errorf("%w: %w (stderr: %s)", inv.sentinel, err, proc.StderrTail())
	}

	if err := vendorRanTheTurn(ctx, proc, inv.sentinel, outcome); err != nil {
		return outcome, err
	}

	return outcome, nil
}

// vendorReapGrace bounds the wait for a final exit status.
//
// Reaching here means stdout hit EOF, which all but always means the child is
// gone; the bound covers the child that closed stdout and lingered, so a
// diagnosis attempt can never become a hang.
const vendorReapGrace = 2 * time.Second

// vendorRanTheTurn reports whether the invocation produced a turn at all.
//
// A CLI that fails before emitting anything -- a bad key, an unknown flag, no
// network -- closes stdout immediately, and an empty stream is
// indistinguishable from a turn with nothing in it *unless* the exit status is
// consulted. Without this, such a failure is reported as a successful empty
// turn: the user gets no answer and no reason, while the reason sits unread on
// the child's stderr.
//
// A non-zero exit *after* a result event is a different case and is left alone:
// the turn happened, and discarding a delivered transcript over the CLI's
// parting exit code would lose real output.
func vendorRanTheTurn(
	ctx context.Context,
	proc *shellexec.StreamHandle,
	sentinel error,
	outcome turnOutcome,
) error {
	if outcome.sawResult || ctx.Err() != nil {
		return nil
	}

	timer := time.NewTimer(vendorReapGrace)
	defer timer.Stop()

	select {
	case <-proc.Exited():
	case <-timer.C:
		// No status to judge by. Treat the turn as it drained rather than
		// inventing a failure.
		return nil
	}

	if proc.ExitCode() == 0 {
		return nil
	}

	return fmt.Errorf(
		"%w: exited %d without running the turn (stderr: %s)",
		sentinel, proc.ExitCode(), strings.TrimSpace(proc.StderrTail()),
	)
}

// textUpdate builds a session/update carrying one chunk of text.
func textUpdate(kind acpfx.SessionUpdateKind, text string) acpfx.SessionUpdate {
	return acpfx.SessionUpdate{ //nolint:exhaustruct
		SessionUpdate: kind,
		Content:       &acpfx.ContentBlock{Type: acpfx.ContentBlockText, Text: text}, //nolint:exhaustruct
	}
}

// recordingEmit tees the agent's message text into answer on its way out.
//
// The transcript a vendor cannot remember for itself has to be reconstructed
// from what was streamed, and this is the only point where every chunk is
// already known to be going to the client.
func recordingEmit(emit acpfx.UpdateFunc, answer *strings.Builder) acpfx.UpdateFunc {
	return func(update acpfx.SessionUpdate) error {
		if update.SessionUpdate == acpfx.UpdateAgentMessageChunk && update.Content != nil {
			answer.WriteString(update.Content.Text)
		}

		return emit(update)
	}
}

// promptText flattens ACP content blocks to the plain text these CLIs accept.
//
// A block the vendor cannot take is named rather than dropped: handing it a
// prompt that silently omits what the user attached produces a confidently
// wrong answer, where a visible placeholder produces a question.
func promptText(blocks []acpfx.ContentBlock) string {
	parts := make([]string, 0, len(blocks))

	for _, block := range blocks {
		if block.Type == acpfx.ContentBlockText {
			parts = append(parts, block.Text)

			continue
		}

		parts = append(parts, fmt.Sprintf("[unsupported content block: %s]", block.Type))
	}

	return strings.Join(parts, "\n")
}

// writePlainPrompt sends the prompt as raw text.
//
// The trailing newline is for the vendor that reads stdin a line at a time;
// stdin is closed immediately afterwards, so a vendor that reads to EOF is
// unaffected either way.
func writePlainPrompt(writer io.Writer, text string) error {
	if _, err := io.WriteString(writer, text+"\n"); err != nil {
		return fmt.Errorf("write prompt: %w", err)
	}

	return nil
}

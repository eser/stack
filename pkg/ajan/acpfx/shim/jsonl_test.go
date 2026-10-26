// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package shim_test

import (
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/acpfx"
	"github.com/eser/stack/pkg/ajan/acpfx/shim"
)

// The kiro and opencode backends are exercised the same way as claude-code: a
// real client, a real agent, a real subprocess. Only the vendor is faked, and
// it is faked at the level of its wire format.

// fakeJSONLEnv selects the fake JSONL vendor's mode, as "<vocabulary>:<action>".
const fakeJSONLEnv = "ACP_SHIM_FAKE_JSONL"

const (
	vocabKiro     = "kiro"
	vocabOpenCode = "opencode"
)

const (
	// jsonlTurn emits a two-chunk answer and a terminal event.
	jsonlTurn = "turn"

	// jsonlEcho reports its argv and stdin, so a test can assert on how it was
	// invoked and what it was told.
	jsonlEcho = "echo"

	// jsonlError emits some content and then announces a failure.
	jsonlError = "error"

	// jsonlNoise mixes an event this shim has no vocabulary for with a line of
	// plain prose.
	jsonlNoise = "noise"

	// jsonlLong emits one JSON line far past bufio.Scanner's 64 KiB limit.
	jsonlLong = "long"

	// jsonlUnterminated ends its last event without a trailing newline, which
	// is what a CLI killed or flushed at exit produces.
	jsonlUnterminated = "unterminated"

	// jsonlMultiblock emits one assistant message carrying several content
	// blocks.
	jsonlMultiblock = "multiblock"
)

// longChunkBytes is the size of jsonlLong's payload: comfortably past the 64
// KiB a bufio.Scanner would refuse, so a line-reader regression truncates the
// answer rather than merely coming close.
const longChunkBytes = 200 << 10

// runFakeJSONL impersonates a vendor CLI that answers with a JSONL stream. It
// never returns.
func runFakeJSONL(mode string) {
	stdin, _ := io.ReadAll(os.Stdin)

	vocabulary, action, _ := strings.Cut(mode, ":")

	encoder := json.NewEncoder(os.Stdout)
	emit := func(event map[string]any) { _ = encoder.Encode(event) }

	text := func(s string) map[string]any {
		if vocabulary == vocabOpenCode {
			return map[string]any{
				"type":  "content_block_delta",
				"delta": map[string]any{"text": s},
			}
		}

		return map[string]any{"type": "content", "text": s}
	}

	done := map[string]any{"type": "done"}
	if vocabulary == vocabOpenCode {
		done = map[string]any{"type": "result", "usage": map[string]any{"input_tokens": 7}}
	}

	switch action {
	case jsonlEcho:
		emit(text("ARGV: " + strings.Join(os.Args[1:], " ")))
		emit(text("STDIN: " + strings.TrimSpace(string(stdin))))
		emit(done)

	case jsonlError:
		emit(text("partial answer"))

		if vocabulary == vocabOpenCode {
			// The nested shape.
			emit(map[string]any{
				"type":  "error",
				"error": map[string]any{"message": "quota exhausted"},
			})
		} else {
			// The flat shape, so both branches of the message lookup are covered.
			emit(map[string]any{"type": "error", "message": "quota exhausted"})
		}

	case jsonlNoise:
		emit(map[string]any{"type": "telemetry", "tokens": 42})
		_, _ = os.Stdout.WriteString("plain prose line\n")
		emit(done)

	case jsonlLong:
		emit(text(strings.Repeat("L", longChunkBytes)))
		emit(done)

	case jsonlUnterminated:
		emit(text("first. "))

		// Encoded by hand: json.Encoder always writes the newline this mode
		// exists to withhold.
		last, _ := json.Marshal(text("last, with no newline."))
		_, _ = os.Stdout.Write(last)

	case jsonlMultiblock:
		emit(map[string]any{
			"type": "assistant",
			"message": map[string]any{"content": []map[string]any{
				{"text": "one "}, {"text": "two "}, {"text": "three"},
			}},
		})
		emit(done)

	default:
		emit(text("Hello, "))
		emit(text("world."))
		emit(done)
	}

	os.Exit(0)
}

func fakeKiro(t *testing.T, action string) *shim.Kiro {
	t.Helper()

	t.Setenv(fakeJSONLEnv, vocabKiro+":"+action)

	return &shim.Kiro{Command: os.Args[0], ExtraArgs: nil} //nolint:exhaustruct
}

func fakeOpenCode(t *testing.T, action string) *shim.OpenCode {
	t.Helper()

	t.Setenv(fakeJSONLEnv, vocabOpenCode+":"+action)

	return &shim.OpenCode{Command: os.Args[0], ExtraArgs: nil} //nolint:exhaustruct
}

// TestKiroTranslatesAVendorTurn is the translation contract for kiro's
// vocabulary: JSONL in, ACP session/update out.
func TestKiroTranslatesAVendorTurn(t *testing.T) {
	client, handler := connectShim(t, fakeKiro(t, jsonlTurn))

	resp, err := newShimSession(t, client).Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
	)
	if err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	if resp.StopReason != acpfx.StopReasonEndTurn {
		t.Fatalf("stopReason = %q, want end_turn", resp.StopReason)
	}

	waitFor(t, "the answer", func() bool {
		return handler.texts(acpfx.UpdateAgentMessageChunk) == "Hello, world."
	})
}

// TestOpenCodeTranslatesAVendorTurn is the same contract against opencode's
// different event vocabulary.
func TestOpenCodeTranslatesAVendorTurn(t *testing.T) {
	client, handler := connectShim(t, fakeOpenCode(t, jsonlTurn))

	resp, err := newShimSession(t, client).Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
	)
	if err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	if resp.StopReason != acpfx.StopReasonEndTurn {
		t.Fatalf("stopReason = %q, want end_turn", resp.StopReason)
	}

	waitFor(t, "the answer", func() bool {
		return handler.texts(acpfx.UpdateAgentMessageChunk) == "Hello, world."
	})
}

// TestKiroDoesNotEchoUnrecognisedJSONAsTheAnswer pins the fix for a defect the
// aifx adapters shipped.
//
// Their line loop emitted any line the mapper did not recognise as content, so
// an event carrying telemetry, a heartbeat or a config dump was handed to the
// user as the thing the agent said. Prose still counts as answer text here --
// kiro's --output json does not promise a pure stream -- but a JSON object with
// no text in it must not.
func TestKiroDoesNotEchoUnrecognisedJSONAsTheAnswer(t *testing.T) {
	client, handler := connectShim(t, fakeKiro(t, jsonlNoise))

	if _, err := newShimSession(t, client).Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
	); err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	waitFor(t, "the prose line", func() bool {
		return strings.Contains(handler.texts(acpfx.UpdateAgentMessageChunk), "plain prose line")
	})

	answer := handler.texts(acpfx.UpdateAgentMessageChunk)

	for _, leaked := range []string{"telemetry", "tokens", "42"} {
		if strings.Contains(answer, leaked) {
			t.Fatalf(
				"an unrecognised JSON event reached the user as answer text (%q in %q)",
				leaked, truncate(answer),
			)
		}
	}
}

// TestOpenCodeDropsNonJSONLines pins the other half of that judgement.
//
// opencode's --output-format stream-json does promise a pure stream, so a line
// that is not JSON is a diagnostic. Streaming it would put the vendor's
// warnings in the transcript as if the agent had said them.
func TestOpenCodeDropsNonJSONLines(t *testing.T) {
	client, handler := connectShim(t, fakeOpenCode(t, jsonlNoise))

	if _, err := newShimSession(t, client).Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
	); err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	if answer := handler.texts(acpfx.UpdateAgentMessageChunk); answer != "" {
		t.Fatalf("a strict JSONL stream leaked non-event output: %q", truncate(answer))
	}
}

// TestVendorErrorEventFailsTheTurn pins that an announced failure is reported
// as one, and that the content streamed before it is not thrown away.
//
// The alternative -- ending with end_turn and the error text as the answer --
// presents the vendor's failure as the assistant's reply. Failing costs
// nothing: the updates already sent are notifications the client has, and a
// failed prompt response does not retract them.
func TestVendorErrorEventFailsTheTurn(t *testing.T) {
	for _, tc := range []struct {
		backend func(*testing.T, string) shim.Backend
		name    string
	}{
		{
			name:    "kiro",
			backend: func(t *testing.T, a string) shim.Backend { t.Helper(); return fakeKiro(t, a) },
		},
		{
			name: "opencode",
			backend: func(t *testing.T, a string) shim.Backend {
				t.Helper()

				return fakeOpenCode(t, a)
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client, handler := connectShim(t, tc.backend(t, jsonlError))

			_, err := newShimSession(t, client).Prompt(
				t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
			)
			if err == nil {
				t.Fatal("a vendor that announced an error reported success")
			}

			if !strings.Contains(err.Error(), "quota exhausted") {
				t.Fatalf("error %q does not carry the vendor's message", err)
			}

			waitFor(t, "the partial answer", func() bool {
				return strings.Contains(
					handler.texts(acpfx.UpdateAgentMessageChunk), "partial answer",
				)
			})
		})
	}
}

// TestJSONLLineSurvivesPastTheScannerLimit pins the bufio.Reader choice.
//
// bufio.Scanner refuses a line over 64 KiB, and a single event carrying a long
// answer passes that easily. The failure mode is silent: the stream stops at
// the oversized line and the turn ends looking clean, having delivered a
// truncated answer.
func TestJSONLLineSurvivesPastTheScannerLimit(t *testing.T) {
	client, handler := connectShim(t, fakeKiro(t, jsonlLong))

	if _, err := newShimSession(t, client).Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
	); err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	waitFor(t, "the long chunk", func() bool {
		return len(handler.texts(acpfx.UpdateAgentMessageChunk)) >= longChunkBytes
	})

	if got := len(handler.texts(acpfx.UpdateAgentMessageChunk)); got != longChunkBytes {
		t.Fatalf("answer is %d bytes, want %d -- the line was truncated", got, longChunkBytes)
	}
}

// TestLastLineWithoutANewlineIsNotDropped pins the read ordering in the drain
// loop.
//
// A reader hands back the final unterminated line together with io.EOF. Code
// that checks the error first -- the natural way to write the loop -- discards
// that line, so the last thing the vendor said is lost exactly when the vendor
// was cut short and that line matters most.
func TestLastLineWithoutANewlineIsNotDropped(t *testing.T) {
	client, handler := connectShim(t, fakeKiro(t, jsonlUnterminated))

	if _, err := newShimSession(t, client).Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
	); err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	waitFor(t, "the first chunk", func() bool {
		return strings.Contains(handler.texts(acpfx.UpdateAgentMessageChunk), "first.")
	})

	if got := handler.texts(acpfx.UpdateAgentMessageChunk); got != "first. last, with no newline." {
		t.Fatalf("answer = %q -- the unterminated final line was dropped", got)
	}
}

// TestOpenCodeKeepsEveryContentBlock pins a defect carried over from aifx.
//
// extractOpenCodeText read Content[0] and returned, so an assistant message
// split across blocks arrived as its opening fragment and nothing else -- a
// silent truncation that looks like a terse answer.
func TestOpenCodeKeepsEveryContentBlock(t *testing.T) {
	client, handler := connectShim(t, fakeOpenCode(t, jsonlMultiblock))

	if _, err := newShimSession(t, client).Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("hi")},
	); err != nil {
		t.Fatalf("Prompt: %v", err)
	}

	waitFor(t, "the answer", func() bool {
		return strings.Contains(handler.texts(acpfx.UpdateAgentMessageChunk), "one")
	})

	if got := handler.texts(acpfx.UpdateAgentMessageChunk); got != "one two three" {
		t.Fatalf("answer = %q, want all three blocks", got)
	}
}

// TestKiroCarriesContextAcrossTurns pins the conversational memory.
//
// The kiro CLI has no session id and no --resume, so without the shim keeping
// the transcript a follow-up question would reach a vendor that has never heard
// of the conversation -- and would be answered confidently in isolation, which
// looks like it worked.
func TestKiroCarriesContextAcrossTurns(t *testing.T) {
	client, handler := connectShim(t, fakeKiro(t, jsonlEcho))

	session := newShimSession(t, client)

	if _, err := session.Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("what is the capital of France")},
	); err != nil {
		t.Fatalf("first Prompt: %v", err)
	}

	waitFor(t, "the first turn", func() bool {
		return strings.Contains(handler.texts(acpfx.UpdateAgentMessageChunk), "STDIN:")
	})

	first := handler.texts(acpfx.UpdateAgentMessageChunk)

	// A first turn is sent verbatim: no role labels for the vendor to interpret.
	if strings.Contains(first, "User: what is the capital") {
		t.Fatal("the first turn was labelled; a lone prompt should go verbatim")
	}

	if _, err := session.Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock("and of Spain")},
	); err != nil {
		t.Fatalf("second Prompt: %v", err)
	}

	waitFor(t, "the second turn", func() bool {
		return strings.Count(handler.texts(acpfx.UpdateAgentMessageChunk), "STDIN:") >= 2
	})

	second := strings.TrimPrefix(handler.texts(acpfx.UpdateAgentMessageChunk), first)

	for _, want := range []string{
		"User: what is the capital of France", // the earlier question
		"Assistant:",                          // labelled as the vendor's own words
		"User: and of Spain",                  // the new question, last
	} {
		if !strings.Contains(second, want) {
			t.Fatalf("the second turn did not carry %q: %s", want, truncate(second))
		}
	}
}

// TestKiroSendsPromptOnStdinNotArgv pins the ARG_MAX property for this backend.
func TestKiroSendsPromptOnStdinNotArgv(t *testing.T) {
	client, handler := connectShim(t, fakeKiro(t, jsonlEcho))

	// Large enough that an argv-based implementation would fail outright.
	needle := strings.Repeat("abcdefgh", 64*1024) // 512 KiB

	if _, err := newShimSession(t, client).Prompt(
		t.Context(), []acpfx.ContentBlock{acpfx.TextBlock(needle)},
	); err != nil {
		t.Fatalf("Prompt with a 512 KiB prompt: %v", err)
	}

	waitFor(t, "the echo", func() bool {
		return strings.Contains(handler.texts(acpfx.UpdateAgentMessageChunk), "STDIN:")
	})

	argv, stdin, _ := strings.Cut(handler.texts(acpfx.UpdateAgentMessageChunk), "STDIN:")

	if !strings.Contains(stdin, needle) {
		t.Fatal("the prompt did not arrive on stdin")
	}

	if strings.Contains(argv, needle) {
		t.Fatal("the prompt was passed as argv -- this is the ARG_MAX hazard")
	}

	if !strings.Contains(argv, "--output json") {
		t.Fatalf("invocation missing the machine-readable flag: %q", truncate(argv))
	}
}

// TestJSONLBackendsDeclareReducedCapabilities pins that the vendor gaps are
// advertised rather than discovered.
//
// The aifx adapters made the same claims for every CLI and left the differences
// to be found at runtime. What ACP can express, these backends now say: neither
// vendor can resume a session, and neither can take anything but text.
//
// What ACP cannot express is the tool-call gap -- tool calls are session/update
// variants rather than a negotiated capability -- so that one is documented on
// Kiro.Capabilities instead, and this test cannot pin it.
func TestJSONLBackendsDeclareReducedCapabilities(t *testing.T) {
	for _, tc := range []struct {
		backend shim.Backend
		name    string
	}{
		{name: "kiro", backend: fakeKiro(t, jsonlTurn)},
		{name: "opencode", backend: fakeOpenCode(t, jsonlTurn)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client, _ := connectShim(t, tc.backend)

			caps := client.AgentCapabilities()

			if caps.LoadSession {
				t.Fatal("advertised loadSession, which the vendor CLI cannot honour")
			}

			if caps.Prompt.EmbeddedContext || caps.Prompt.Image || caps.Prompt.Audio {
				t.Fatalf(
					"advertised prompt content it flattens to text on stdin: %+v", caps.Prompt,
				)
			}
		})
	}
}

// TestClaudeCodeStillDeclaresMoreThanTheJSONLBackends guards the above from
// becoming vacuous.
//
// A capability set that is false everywhere would pass the previous test while
// saying nothing. These are per-vendor statements, so at least one backend must
// differ.
func TestClaudeCodeStillDeclaresMoreThanTheJSONLBackends(t *testing.T) {
	claude := (&shim.ClaudeCode{Command: "", ExtraArgs: nil}).Capabilities()

	if !claude.Prompt.EmbeddedContext {
		t.Fatal("claude-code no longer declares embeddedContext, so the reduced-capability " +
			"test above compares against nothing")
	}
}

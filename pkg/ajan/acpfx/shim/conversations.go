// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package shim

import (
	"strings"
	"sync"
)

// exchange is one completed prompt and the answer it drew.
type exchange struct {
	prompt string
	answer string
}

// conversations remembers what was said in each session, for vendors that
// cannot remember it themselves.
//
// Claude Code carries a conversation forward with --resume and a session id.
// kiro and opencode have neither: each invocation is a fresh agent that is told
// something and answers it. Without this, the second turn of a session would
// arrive knowing nothing about the first -- the user asks a follow-up question
// and gets an answer to it in isolation, which is worse than an error because
// it looks like it worked.
//
// The aifx CLI adapters this replaces had the same gap and filled it the same
// way, by flattening the caller's whole message history into one text prompt.
// The difference is only who owns the history: ACP sends the shim just the new
// prompt each turn, so the shim keeps it.
//
// # The bound
//
// A session's prompt grows with every turn and nothing here trims it, so a long
// enough conversation eventually exceeds what the vendor accepts and the turn
// fails with the vendor's own error. That is deliberate: any truncation policy
// silently drops context the user still believes is in play, and a wrong answer
// derived from a quietly shortened history is harder to notice than a failed
// turn.
type conversations struct {
	mu      sync.Mutex
	history map[string][]exchange
}

// render returns the text to send for a prompt in this session.
func (c *conversations) render(sessionID string, prompt string) string {
	c.mu.Lock()
	defer c.mu.Unlock()

	past := c.history[sessionID]
	if len(past) == 0 {
		// A first turn goes verbatim. Labelling a lone prompt would change what
		// the vendor sees in the common one-shot case for no gain, and these
		// CLIs are tuned for a bare instruction.
		return prompt
	}

	var builder strings.Builder

	// Roles are labelled, which the aifx flattening did not do. An unlabelled
	// concatenation reads as one long instruction, so the vendor cannot tell
	// which parts it already said -- and it will happily follow its own previous
	// answer as if the user had written it.
	for _, past := range past {
		builder.WriteString("User: ")
		builder.WriteString(past.prompt)
		builder.WriteString("\n\nAssistant: ")
		builder.WriteString(past.answer)
		builder.WriteString("\n\n")
	}

	builder.WriteString("User: ")
	builder.WriteString(prompt)

	return builder.String()
}

// record adds a completed exchange to the session's history.
//
// Only a turn that actually answered is worth recording: a failed or empty turn
// would otherwise leave an "Assistant:" with nothing after it in every
// subsequent prompt, which reads to the vendor as a refusal it once made.
func (c *conversations) record(sessionID string, prompt string, answer string) {
	if answer == "" {
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	if c.history == nil {
		c.history = make(map[string][]exchange)
	}

	c.history[sessionID] = append(c.history[sessionID], exchange{prompt: prompt, answer: answer})
}

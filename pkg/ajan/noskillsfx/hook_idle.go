// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"embed"
	"encoding/json"
	"fmt"
	"path"
	"time"
)

// The built-in concerns, the tools' interaction hints and the pieces of the
// compiled output that the SessionStart hook and `noskills next` share.

// defaultConcernFiles are the built-in concerns, copied byte for byte from
// pkg/@eserstack/noskills/defaults/concerns (a test keeps them equal); file
// names are snake_case here, as this tree requires.
//
//go:embed defaults/concerns/*.json
var defaultConcernFiles embed.FS

// DefaultConcern is a built-in concern as the IDLE output lists it.
type DefaultConcern struct {
	ID          string `json:"id"`
	Description string `json:"description"`
}

// DefaultConcerns returns the built-in concerns in their numbered order.
func DefaultConcerns() ([]DefaultConcern, error) {
	entries, err := defaultConcernFiles.ReadDir("defaults/concerns")
	if err != nil {
		return nil, fmt.Errorf("list the built-in concerns: %w", err)
	}

	concerns := make([]DefaultConcern, 0, len(entries))

	for _, entry := range entries {
		data, err := defaultConcernFiles.ReadFile(path.Join("defaults/concerns", entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("read the built-in concern %s: %w", entry.Name(), err)
		}

		var concern DefaultConcern
		if err := json.Unmarshal(data, &concern); err != nil {
			return nil, fmt.Errorf("parse the built-in concern %s: %w", entry.Name(), err)
		}

		concerns = append(concerns, concern)
	}

	return concerns, nil
}

// InteractionHintsForTool returns the interaction hints of a tool's sync
// adapter, or the Claude Code defaults for a tool noskills has no adapter
// for (sync/engine.ts interactionHintsFor).
func InteractionHintsForTool(toolID string) InteractionHints {
	prose := func(delegates bool, method string) InteractionHints {
		return InteractionHints{
			HasAskUserTool:        false,
			OptionPresentation:    "prose",
			HasSubAgentDelegation: delegates,
			SubAgentMethod:        method,
			PlanModeShortcut:      "",
			Headless:              false,
		}
	}

	switch toolID {
	case CodingToolCodex:
		return prose(true, "spawn")
	case CodingToolCopilotCLI:
		return prose(true, "fleet")
	case CodingToolKiro, CodingToolOpencode:
		return prose(true, "delegation")
	case CodingToolCopilot, CodingToolCursor, CodingToolWindsurf:
		return prose(false, "none")
	default:
		return DefaultInteractionHints
	}
}

// ResolveInteractionHints returns the hints of the first tool the manifest
// lists, or the Claude Code defaults.
func ResolveInteractionHints(tools []string) InteractionHints {
	if len(tools) == 0 {
		return DefaultInteractionHints
	}

	return InteractionHintsForTool(tools[0])
}

const (
	idleWelcome = "noskills is a state-machine orchestrator that acts as a scrum master for both you and your " +
		"agent — keeping work focused, decisions in your hands, and tokens efficient."
	protocolWhat = "noskills orchestrates your work: IDLE → DISCOVERY → DISCOVERY_REFINEMENT → SPEC_PROPOSAL → " +
		"SPEC_APPROVED → EXECUTING → DONE → IDLE"
	staleSessionAfter = 5 * time.Minute
	idleRoadmap       = "[ IDLE ] → DISCOVERY → REFINEMENT → PROPOSAL → APPROVED → EXECUTING → COMPLETED → IDLE"
	confidenceRule    = "Confidence scoring: every technical finding needs a confidence score (1-10). 9-10: " +
		"verified (read code, ran test). 7-8: strong evidence. 5-6: reasonable inference. 3-4: guess. 1-2: " +
		"speculation. State basis ('read X', 'inferred from Y'). If confidence < 5, prefix with '⚠ Unverified:'."
)

// copyField copies a field when the source has it, as an object literal
// with an undefined value prints nothing.
func copyField(to, from *JSObject, key string) {
	if value, ok := from.get(key); ok {
		to.set(key, value)
	}
}

func enforcementOf(hints InteractionHints) *JSObject {
	if hints.HasSubAgentDelegation {
		return JSObjectOf("level", "enforced", "capabilities", []any{
			"PreToolUse file edit gate", "Git write guard", "Stop iteration tracking", "PostToolUse file logging",
			"Sub-agent delegation",
		})
	}

	return JSObjectOf(
		"level", "behavioral",
		"capabilities", []any{"Behavioral rules only"},
		"gaps", []any{
			"File edits not blocked in non-execution phases", "Git write commands not blocked",
			"No iteration tracking", "No file change logging", "No sub-agent delegation available",
		},
	)
}

// protocolGuide is the guide a first call, or a call after five idle
// minutes, includes; nil otherwise.
func protocolGuide(state *JSObject, now time.Time, cs func(string) string) *JSObject {
	lastCalled, present := state.get("lastCalledAt")

	include := false

	switch {
	case present && lastCalled == nil:
		include = true
	case present:
		text, _ := lastCalled.(string)
		if t, ok := parseISODate(text); ok && now.Sub(t) > staleSessionAfter {
			include = true
		}
	}

	if !include {
		return nil
	}

	return JSObjectOf(
		"what", protocolWhat,
		"how", "Run `"+cs("next")+"` for instructions. Submit results with `"+cs(`next --answer="..."`)+
			"`. Never make architectural decisions without asking.",
		"currentPhase", StringField(state, "phase"),
	)
}

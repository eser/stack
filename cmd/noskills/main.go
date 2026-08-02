// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// noskills is a CLI for managing software specifications via the noskillsfx
// state machine. It drives the agent-guided discovery → spec → execution lifecycle.
//
// Usage:
//
//	noskills init
//	noskills spec new "<description>"
//	noskills spec list
//	noskills spec <name> next [--answer="<text>"]
//	noskills concern add <id> [<id>...]
//	noskills concern remove <id>
//	noskills concern list
//	noskills rule add "<text>"
//	noskills rule list
//	noskills version
package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/httpclient"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
	webtransportfx "github.com/eser/stack/pkg/ajan/webtransport"
)

const cliVersion = "0.1.0"

// slug helpers delegate to the noskillsfx package so both the CLI and the FFI
// bridge share the same implementation.

func slugFromDescription(d string) string { return noskillsfx.SlugFromDescription(d) }
func looksLikeDescription(v string) bool  { return noskillsfx.LooksLikeDescription(v) }
func isReservedName(n string) bool        { return noskillsfx.ReservedSpecNames[n] }

// =============================================================================
// Entry point
// =============================================================================

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	var err error

	switch cmd {
	case "version", "-v", "--version":
		fmt.Printf("noskills %s\n", cliVersion)
	case "help", "-h", "--help":
		printUsage()
	case "init":
		err = runInit()
	case "spec":
		err = runSpec(args)
	case "attach":
		err = runAttach(args)
	case "session":
		err = runSession(args)
	case "concern":
		err = runConcern(args)
	case "rule":
		err = runRule(args)
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Print(`noskills - spec-driven agent workflow manager

Usage:
  noskills <command> [options]

Commands:
  init                         Initialize noskills in current project
  spec new "<description>"     Create a new spec (name auto-generated)
  spec list                    List all specs
  spec <name> next             Print next instruction (JSON)
  spec <name> next --answer="<text>"
                               Submit answer and advance state

  spec <name> approve          Advance spec phase (DISCOVERY_REFINEMENT→SPEC_PROPOSAL or SPEC_PROPOSAL→SPEC_APPROVED)
  spec <name> done             Complete spec and reset to IDLE
  spec <name> block <reason>   Block spec execution

  concern add <id> [<id>...]   Activate concern(s)
  concern remove <id>          Deactivate a concern
  concern list                 List all concerns

  rule add "<text>"            Add a new rule
  rule list                    List all rules

  session start [--spec=<name>] [--free] [--auto]
                               Start an agent session
  session end [--id=<id>]      End a session
  session list                 List active sessions
  session gc                   Remove stale sessions (>2h old)

  attach <slug> [--session=<sid>] [--daemon=<url>] [--token=<tok>] [--cert-hash=<hex>]
                               Attach to a noskills-server session over WebTransport

  version                      Print version
  help                         Show this help

`)
}

// =============================================================================
// init
// =============================================================================

func runInit() error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	if err := noskillsfx.ScaffoldEserDir(root); err != nil {
		return err
	}

	p := noskillsfx.NewPaths(root)

	// Write .eser/.gitignore to keep state out of git.
	gitignoreContent := ".state/\n"
	if writeErr := os.WriteFile(p.EserGitignore, []byte(gitignoreContent), 0o644); writeErr != nil { //nolint:gosec
		return fmt.Errorf("init: write .gitignore: %w", writeErr)
	}

	if !noskillsfx.IsInitialized(root) {
		manifest := noskillsfx.NosManifest{
			Concerns:                   []string{},
			Tools:                      []noskillsfx.CodingToolID{noskillsfx.CodingToolClaudeCode},
			Providers:                  []string{},
			MaxIterationsBeforeRestart: 15,
			AllowGit:                   false,
			Command:                    "deno task cli noskills",
		}

		if writeErr := noskillsfx.WriteManifest(root, manifest); writeErr != nil {
			return writeErr
		}
	}

	fmt.Printf("Initialized noskills in %s\n", root)

	return nil
}

// =============================================================================
// spec
// =============================================================================

func runSpec(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("spec requires a subcommand: new, list, or <name> next")
	}

	sub := args[0]

	switch sub {
	case "new":
		return runSpecNew(args[1:])
	case "list":
		return runSpecList()
	default:
		// spec <name> <subcommand> [args...]
		specName := sub
		if len(args) < 2 {
			return fmt.Errorf("spec %s: requires a subcommand (next)", specName)
		}

		specSub := args[1]

		switch specSub {
		case "next":
			return runSpecNext(specName, args[2:])
		case "approve":
			return runSpecApprove(specName)
		case "done":
			return runSpecDone(specName, args[2:])
		case "block":
			return runSpecBlock(specName, args[2:])
		default:
			return fmt.Errorf("spec %s: unknown subcommand %q (supported: next, approve, done, block)", specName, specSub)
		}
	}
}

// runSpecNew creates a new spec, auto-generating the slug from the description.
func runSpecNew(args []string) error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	if !noskillsfx.IsInitialized(root) {
		return fmt.Errorf("noskills is not initialized — run: noskills init")
	}

	// Parse args: "noskills spec new [<name>] <description> [--from-plan=<path>]"
	var specName string
	var planPath string
	descWords := make([]string, 0, 8)

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--name="):
			specName = strings.TrimPrefix(arg, "--name=")
		case strings.HasPrefix(arg, "--from-plan="):
			planPath = strings.TrimPrefix(arg, "--from-plan=")
		case !strings.HasPrefix(arg, "-"):
			descWords = append(descWords, arg)
		}
	}

	// If no explicit --name, determine from positional args.
	if specName == "" && len(descWords) > 0 {
		first := descWords[0]
		if looksLikeDescription(first) {
			// The whole thing is a description — auto-slug.
		} else {
			// First word is the slug, rest is description.
			specName = first
			descWords = descWords[1:]
		}
	}

	description := strings.Join(descWords, " ")

	if specName == "" && description != "" {
		specName = slugFromDescription(description)
	}

	if specName == "" {
		// Interactive prompt (print JSON and exit, agent will re-call with description).
		return json.NewEncoder(os.Stdout).Encode(map[string]string{
			"phase":       "IDLE",
			"action":      "spec-new-interactive",
			"instruction": "Ask the user what they want to build, then call spec new again with their description.",
			"prompt":      "What do you want to build?",
		})
	}

	// Deduplicate slug if it conflicts with an existing spec.
	p := noskillsfx.NewPaths(root)
	candidate := specName
	suffix := 2

	for {
		if isReservedName(candidate) {
			candidate = fmt.Sprintf("%s-%d", specName, suffix)
			suffix++

			continue
		}

		if _, statErr := os.Stat(filepath.Join(p.SpecsDir, candidate)); statErr == nil { //nolint:gosec // candidate is a validated slug
			candidate = fmt.Sprintf("%s-%d", specName, suffix)
			suffix++
		} else {
			break
		}
	}

	specName = candidate

	if isReservedName(specName) {
		return fmt.Errorf("spec name %q is reserved", specName)
	}

	// Create the spec directory.
	specDir := filepath.Join(p.SpecsDir, specName)
	if mkErr := os.MkdirAll(specDir, 0o750); mkErr != nil { //nolint:gosec // specDir constructed from validated slug
		return fmt.Errorf("spec new: mkdir: %w", mkErr)
	}

	// Transition global state IDLE → DISCOVERY.
	state, err := noskillsfx.ReadState(root)
	if err != nil {
		return err
	}

	desc := description
	var descPtr *string
	if desc != "" {
		descPtr = &desc
	}

	branch := detectGitBranch(root)
	state, err = noskillsfx.StartSpec(state, specName, branch, descPtr)

	if err != nil {
		return fmt.Errorf("spec new: %w", err)
	}

	// Record planPath in discovery state if provided.
	if planPath != "" {
		disc := state.Discovery
		disc.PlanPath = &planPath
		state.Discovery = disc
	}

	if writeErr := noskillsfx.WriteState(root, state); writeErr != nil {
		return writeErr
	}

	// Generate the initial spec.md with placeholder sections.
	manifest, err := noskillsfx.ReadManifest(root)
	if err != nil {
		return err
	}

	allConcerns, err := noskillsfx.LoadConcerns(p.ConcernsDir)
	if err != nil {
		return err
	}

	activeConcerns := noskillsfx.FilterActiveConcerns(allConcerns, manifest.Concerns)
	now := time.Now().UTC().Format(time.RFC3339)

	var creator struct{ Name, Email string }

	if manifest.User != nil {
		creator.Name = manifest.User.Name
		creator.Email = manifest.User.Email
	} else {
		creator.Name = "unknown"
	}

	specResult, err := noskillsfx.GenerateInitialSpec(noskillsfx.GenerateSpecArgs{
		SpecName:       specName,
		ActiveConcerns: activeConcerns,
		Classification: nil,
		Creator:        creator,
		Now:            now,
	})
	if err != nil {
		return fmt.Errorf("spec new: generate spec.md: %w", err)
	}

	specFile := p.SpecFile(specName)
	if writeErr := os.WriteFile(specFile, []byte(specResult.Content), 0o644); writeErr != nil { //nolint:gosec
		return fmt.Errorf("spec new: write spec.md: %w", writeErr)
	}

	// Persist placeholder state in spec state.
	specState := state.SpecState
	specState.Placeholders = specResult.Placeholders
	specState.Metadata = specResult.Metadata
	specFile2 := p.SpecFile(specName)
	specState.Path = &specFile2
	state.SpecState = specState

	if writeErr := noskillsfx.WriteState(root, state); writeErr != nil {
		return writeErr
	}

	fmt.Printf("Created spec %q\n", specName)
	fmt.Printf("  spec.md: %s\n", specFile)
	fmt.Printf("Run: noskills spec %s next\n", specName)

	return nil
}

// runSpecList prints the names of all known specs.
func runSpecList() error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	names, err := noskillsfx.ListSpecStates(root)
	if err != nil {
		return err
	}

	// Also show the spec dirs that don't have a state file yet.
	p := noskillsfx.NewPaths(root)
	entries, _ := os.ReadDir(p.SpecsDir) //nolint:errcheck // best-effort

	dirNames := make(map[string]bool, len(entries))

	for _, e := range entries {
		if e.IsDir() {
			dirNames[e.Name()] = true
		}
	}

	for _, n := range names {
		dirNames[n] = true
	}

	// Print active global spec first.
	state, _ := noskillsfx.ReadState(root) //nolint:errcheck // best-effort display

	if len(dirNames) == 0 {
		fmt.Println("No specs found. Run: noskills spec new \"<description>\"")

		return nil
	}

	for name := range dirNames {
		active := ""
		if state.Spec != nil && *state.Spec == name {
			active = fmt.Sprintf(" [%s]", state.Phase)
		}

		fmt.Printf("  %s%s\n", name, active)
	}

	return nil
}

// runSpecNext compiles and prints the next instruction for a spec.
func runSpecNext(specName string, args []string) error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	if !noskillsfx.IsInitialized(root) {
		return fmt.Errorf("noskills is not initialized — run: noskills init")
	}

	// Parse --answer flag.
	var answer string

	for _, arg := range args {
		if strings.HasPrefix(arg, "--answer=") {
			answer = strings.TrimPrefix(arg, "--answer=")
		}
	}

	// Read global state.
	state, err := noskillsfx.ReadState(root)
	if err != nil {
		return err
	}

	// If global state doesn't match this spec, try per-spec state.
	if state.Spec == nil || *state.Spec != specName {
		perSpec, psErr := noskillsfx.ReadSpecState(root, specName)
		if psErr != nil {
			return psErr
		}

		if perSpec != nil {
			state = *perSpec
		}
	}

	// Read manifest for concerns + config.
	manifest, err := noskillsfx.ReadManifest(root)
	if err != nil {
		return err
	}

	// Load concern definitions for compiler.
	p := noskillsfx.NewPaths(root)

	allConcerns, err := noskillsfx.LoadConcerns(p.ConcernsDir)
	if err != nil {
		return err
	}

	activeConcerns := noskillsfx.FilterActiveConcerns(allConcerns, manifest.Concerns)

	// Handle --answer.
	if answer != "" {
		state, err = applyAnswer(state, answer, activeConcerns)
		if err != nil {
			return err
		}

		now := time.Now().UTC().Format(time.RFC3339)
		state.LastCalledAt = &now

		if writeErr := noskillsfx.WriteState(root, state); writeErr != nil {
			return writeErr
		}
	}

	// Compile NextOutput and print as JSON.
	out := noskillsfx.Compile(state, manifest, noskillsfx.CompileOptions{
		AllConcerns: allConcerns,
	})

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")

	return enc.Encode(out)
}

// applyAnswer applies a --answer string to the current state depending on phase.
func applyAnswer(state noskillsfx.StateFile, answer string, activeConcerns []noskillsfx.ConcernDefinition) (noskillsfx.StateFile, error) {
	switch state.Phase {
	case noskillsfx.PhaseDiscovery:
		// First unanswered step: mode selection (when mode is not set).
		if state.Discovery.Mode == nil {
			mode := strings.TrimSpace(answer)
			disc := state.Discovery
			disc.Mode = &mode
			state.Discovery = disc

			return state, nil
		}

		// Otherwise add a discovery question answer.
		questions := noskillsfx.GetQuestionsWithExtras(activeConcerns)
		next := noskillsfx.GetNextUnanswered(questions, state.Discovery.Answers)

		if next != nil {
			state = noskillsfx.AddDiscoveryAnswer(state, noskillsfx.DiscoveryAnswer{
				QuestionID: next.ID,
				Answer:     answer,
			})

			if noskillsfx.IsDiscoveryComplete(state.Discovery.Answers) {
				var err error

				state, err = noskillsfx.CompleteDiscovery(state)
				if err != nil {
					return state, fmt.Errorf("complete discovery: %w", err)
				}
			}
		}

	case noskillsfx.PhaseExecuting:
		state = noskillsfx.AdvanceExecution(state, answer)

	default:
		// Other phases: store the answer as a decision for now.
		state = noskillsfx.AddDecision(state, noskillsfx.Decision{
			ID:        fmt.Sprintf("answer-%d", len(state.Decisions)+1),
			Question:  "agent-answer",
			Choice:    answer,
			Promoted:  false,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}

	return state, nil
}

// =============================================================================
// concern
// =============================================================================

func runConcern(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("concern requires a subcommand: add, remove, list")
	}

	sub := args[0]

	switch sub {
	case "add":
		return runConcernAdd(args[1:])
	case "remove":
		return runConcernRemove(args[1:])
	case "list":
		return runConcernList()
	default:
		return fmt.Errorf("concern: unknown subcommand %q (supported: add, remove, list)", sub)
	}
}

func runConcernAdd(ids []string) error {
	if len(ids) == 0 {
		return fmt.Errorf("concern add: specify at least one concern ID")
	}

	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	manifest, err := noskillsfx.ReadManifest(root)
	if err != nil {
		return err
	}

	// Deduplicate.
	existing := make(map[string]bool, len(manifest.Concerns))
	for _, c := range manifest.Concerns {
		existing[c] = true
	}

	for _, id := range ids {
		if !existing[id] {
			manifest.Concerns = append(manifest.Concerns, id)
			existing[id] = true
			fmt.Printf("Added concern: %s\n", id)
		} else {
			fmt.Printf("Concern already active: %s\n", id)
		}
	}

	return noskillsfx.WriteManifest(root, manifest)
}

func runConcernRemove(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("concern remove: specify a concern ID")
	}

	id := args[0]
	root, err := noskillsfx.ResolveProjectRoot("")

	if err != nil {
		return err
	}

	manifest, err := noskillsfx.ReadManifest(root)
	if err != nil {
		return err
	}

	filtered := make([]string, 0, len(manifest.Concerns))
	removed := false

	for _, c := range manifest.Concerns {
		if c == id {
			removed = true
		} else {
			filtered = append(filtered, c)
		}
	}

	if !removed {
		return fmt.Errorf("concern %q not found in active concerns", id)
	}

	manifest.Concerns = filtered

	if writeErr := noskillsfx.WriteManifest(root, manifest); writeErr != nil {
		return writeErr
	}

	fmt.Printf("Removed concern: %s\n", id)

	return nil
}

func runConcernList() error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	manifest, err := noskillsfx.ReadManifest(root)
	if err != nil {
		return err
	}

	p := noskillsfx.NewPaths(root)

	allConcerns, err := noskillsfx.LoadConcerns(p.ConcernsDir)
	if err != nil {
		return err
	}

	active := make(map[string]bool, len(manifest.Concerns))
	for _, c := range manifest.Concerns {
		active[c] = true
	}

	if len(allConcerns) == 0 && len(manifest.Concerns) == 0 {
		fmt.Println("No concerns found.")

		return nil
	}

	// Print loaded concerns with active/inactive marker.
	for _, c := range allConcerns {
		marker := "  "
		if active[c.ID] {
			marker = "* "
		}

		fmt.Printf("%s%s — %s\n", marker, c.ID, c.Description)
	}

	// Print any active concern IDs that don't have definition files.
	definedIDs := make(map[string]bool, len(allConcerns))
	for _, c := range allConcerns {
		definedIDs[c.ID] = true
	}

	for _, id := range manifest.Concerns {
		if !definedIDs[id] {
			fmt.Printf("* %s — (no definition file)\n", id)
		}
	}

	return nil
}

// =============================================================================
// rule
// =============================================================================

func runRule(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("rule requires a subcommand: add, list")
	}

	sub := args[0]

	switch sub {
	case "add":
		return runRuleAdd(args[1:])
	case "list":
		return runRuleList()
	default:
		return fmt.Errorf("rule: unknown subcommand %q (supported: add, list)", sub)
	}
}

func runRuleAdd(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("rule add: specify rule text")
	}

	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	if !noskillsfx.IsInitialized(root) {
		return fmt.Errorf("noskills is not initialized — run: noskills init")
	}

	text := strings.Join(args, " ")

	// Strip surrounding quotes if the user quoted the whole thing.
	if len(text) >= 2 && text[0] == '"' && text[len(text)-1] == '"' {
		text = text[1 : len(text)-1]
	}

	p := noskillsfx.NewPaths(root)

	slug := filepath.Base(slugFromDescription(text))
	if slug == "spec" {
		slug = fmt.Sprintf("rule-%d", time.Now().Unix())
	}

	// Deduplicate filename.
	ruleFile := filepath.Join(p.RulesDir, slug+".md")
	counter := 2

	for {
		if _, statErr := os.Stat(ruleFile); os.IsNotExist(statErr) {
			break
		}

		ruleFile = filepath.Join(p.RulesDir, fmt.Sprintf("%s-%d.md", slug, counter))
		counter++
	}

	content := fmt.Sprintf("# Rule\n\n%s\n", text)

	if mkErr := os.MkdirAll(p.RulesDir, 0o750); mkErr != nil {
		return fmt.Errorf("rule add: mkdir: %w", mkErr)
	}

	if writeErr := os.WriteFile(ruleFile, []byte(content), 0o644); writeErr != nil { //nolint:gosec
		return fmt.Errorf("rule add: write: %w", writeErr)
	}

	fmt.Printf("Added rule: %s\n", ruleFile)

	return nil
}

func runRuleList() error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	p := noskillsfx.NewPaths(root)
	entries, err := os.ReadDir(p.RulesDir)

	if err != nil {
		if os.IsNotExist(err) {
			fmt.Println("No rules found.")

			return nil
		}

		return fmt.Errorf("rule list: %w", err)
	}

	count := 0

	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			fmt.Printf("  %s\n", strings.TrimSuffix(e.Name(), ".md"))
			count++
		}
	}

	if count == 0 {
		fmt.Println("No rules found.")
	}

	return nil
}

// =============================================================================
// spec approve / done / block
// =============================================================================

func runSpecApprove(specName string) error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	state, err := noskillsfx.ReadState(root)
	if err != nil {
		return err
	}

	if state.Spec == nil || *state.Spec != specName {
		return fmt.Errorf("spec %q is not the active spec (active: %v)", specName, state.Spec)
	}

	var newState noskillsfx.StateFile

	switch state.Phase {
	case noskillsfx.PhaseDiscoveryRefinement:
		newState, err = noskillsfx.ApproveDiscoveryReview(state)
		if err != nil {
			return err
		}

		fmt.Printf("Spec %q advanced: DISCOVERY_REFINEMENT → SPEC_PROPOSAL\n", specName)

	case noskillsfx.PhaseSpecProposal:
		newState, err = noskillsfx.ApproveSpec(state)
		if err != nil {
			return err
		}

		fmt.Printf("Spec %q advanced: SPEC_PROPOSAL → SPEC_APPROVED\n", specName)

	case noskillsfx.PhaseDiscovery:
		if state.Discovery.Completed {
			fmt.Printf("Discovery complete. Run 'spec %s next' to review, then 'spec %s approve' once in DISCOVERY_REFINEMENT.\n", specName, specName)
		} else {
			fmt.Printf("Discovery still in progress. Complete all questions first.\n")
		}

		return nil

	default:
		return fmt.Errorf("spec %q is in phase %s — approve is not valid here", specName, state.Phase)
	}

	return noskillsfx.WriteState(root, newState)
}

func runSpecDone(specName string, args []string) error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	state, err := noskillsfx.ReadState(root)
	if err != nil {
		return err
	}

	if state.Spec == nil || *state.Spec != specName {
		return fmt.Errorf("spec %q is not the active spec", specName)
	}

	note := ""

	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			if note != "" {
				note += " "
			}

			note += arg
		}
	}

	var notePtr *string
	if note != "" {
		notePtr = &note
	}

	now := time.Now().UTC().Format(time.RFC3339)

	state, err = noskillsfx.CompleteSpec(state, noskillsfx.CompletionDone, notePtr, now)
	if err != nil {
		return err
	}

	// Archive per-spec state, then reset global to IDLE.
	if writeErr := noskillsfx.WriteSpecState(root, specName, state); writeErr != nil {
		return writeErr
	}

	idle, err := noskillsfx.ResetToIdle(state)
	if err != nil {
		return err
	}

	if writeErr := noskillsfx.WriteState(root, idle); writeErr != nil {
		return writeErr
	}

	fmt.Printf("Spec %q marked done. State reset to IDLE.\n", specName)

	return nil
}

func runSpecBlock(specName string, args []string) error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	state, err := noskillsfx.ReadState(root)
	if err != nil {
		return err
	}

	if state.Spec == nil || *state.Spec != specName {
		return fmt.Errorf("spec %q is not the active spec", specName)
	}

	if state.Phase != noskillsfx.PhaseExecuting {
		return fmt.Errorf("spec %q is in phase %s — block requires EXECUTING phase", specName, state.Phase)
	}

	state, err = noskillsfx.BlockExecution(state)
	if err != nil {
		return err
	}

	reason := strings.Join(args, " ")

	if reason != "" {
		// Store reason as a decision.
		state = noskillsfx.AddDecision(state, noskillsfx.Decision{
			ID:        fmt.Sprintf("block-%d", len(state.Decisions)+1),
			Question:  "block-reason",
			Choice:    reason,
			Promoted:  false,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	}

	if writeErr := noskillsfx.WriteState(root, state); writeErr != nil {
		return writeErr
	}

	if reason != "" {
		fmt.Printf("Spec %q blocked: %s\n", specName, reason)
	} else {
		fmt.Printf("Spec %q blocked.\n", specName)
	}

	fmt.Printf("Use: noskills spec %s next --answer=\"<resolution>\"\n", specName)

	return nil
}

// =============================================================================
// session
// =============================================================================

func runSession(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("session requires a subcommand: start, end, list, gc")
	}

	sub := args[0]

	switch sub {
	case "start":
		return runSessionStart(args[1:])
	case "end":
		return runSessionEnd(args[1:])
	case "list":
		return runSessionList()
	case "gc":
		return runSessionGC()
	default:
		return fmt.Errorf("session: unknown subcommand %q (supported: start, end, list, gc)", sub)
	}
}

func runSessionStart(args []string) error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	if !noskillsfx.IsInitialized(root) {
		return fmt.Errorf("noskills is not initialized — run: noskills init")
	}

	var specName string
	mode := noskillsfx.SessionModeFree

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--spec="):
			specName = strings.TrimPrefix(arg, "--spec=")
			mode = noskillsfx.SessionModeSpec
		case arg == "--auto":
			mode = noskillsfx.SessionModeAuto
		case arg == "--free":
			mode = noskillsfx.SessionModeFree
		}
	}

	// Auto mode: pick the single non-completed non-idle spec.
	if mode == noskillsfx.SessionModeAuto && specName == "" {
		state, readErr := noskillsfx.ReadState(root)
		if readErr != nil {
			return readErr
		}

		if state.Phase != noskillsfx.PhaseIdle && state.Phase != noskillsfx.PhaseCompleted &&
			state.Spec != nil {
			specName = *state.Spec
			mode = noskillsfx.SessionModeSpec
		} else {
			mode = noskillsfx.SessionModeFree
		}
	}

	id, err := noskillsfx.GenerateSessionID()
	if err != nil {
		return err
	}

	phase := noskillsfx.PhaseIdle

	if specName != "" {
		// Read current phase for the chosen spec.
		state, _ := noskillsfx.ReadState(root) //nolint:errcheck // best-effort
		if state.Spec != nil && *state.Spec == specName {
			phase = state.Phase
		}
	}

	var specPtr *string
	if specName != "" {
		specPtr = &specName
	}

	session := noskillsfx.Session{
		ID:           id,
		Spec:         specPtr,
		Phase:        phase,
		Mode:         mode,
		LastActiveAt: time.Now().UTC().Format(time.RFC3339),
		ProjectRoot:  &root,
		Tool:         "noskills-cli",
	}

	if createErr := noskillsfx.CreateSession(root, session); createErr != nil {
		return createErr
	}

	fmt.Printf("export NOSKILLS_SESSION=%s\n", id)
	fmt.Printf("export NOSKILLS_PROJECT_ROOT=%s\n", root)

	return nil
}

func runSessionEnd(args []string) error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	var sessionID string

	for _, arg := range args {
		if strings.HasPrefix(arg, "--id=") {
			sessionID = strings.TrimPrefix(arg, "--id=")
		}
	}

	if sessionID == "" {
		sessionID = os.Getenv("NOSKILLS_SESSION")
	}

	if sessionID == "" {
		return fmt.Errorf("session end: no session ID (use --id=<id> or set NOSKILLS_SESSION)")
	}

	removed, err := noskillsfx.DeleteSession(root, sessionID)
	if err != nil {
		return err
	}

	if removed {
		fmt.Printf("Session %s ended.\n", sessionID)
	} else {
		fmt.Printf("Session %s not found.\n", sessionID)
	}

	return nil
}

func runSessionList() error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	sessions, err := noskillsfx.ListSessions(root)
	if err != nil {
		return err
	}

	if len(sessions) == 0 {
		fmt.Println("No active sessions.")

		return nil
	}

	for _, s := range sessions {
		stale := ""
		if noskillsfx.IsSessionStale(s) {
			stale = " [stale]"
		}

		spec := "(free)"
		if s.Spec != nil {
			spec = *s.Spec
		}

		fmt.Printf("  %s  spec=%-20s  phase=%-25s  mode=%-6s  %s%s\n",
			s.ID, spec, s.Phase, s.Mode, s.LastActiveAt, stale)
	}

	return nil
}

func runSessionGC() error {
	root, err := noskillsfx.ResolveProjectRoot("")
	if err != nil {
		return err
	}

	removed, err := noskillsfx.GcStaleSessions(root)
	if err != nil {
		return err
	}

	if len(removed) == 0 {
		fmt.Println("No stale sessions found.")
	} else {
		for _, id := range removed {
			fmt.Printf("Removed stale session: %s\n", id)
		}
	}

	return nil
}

// =============================================================================
// Git helpers
// =============================================================================

// detectGitBranch reads the current HEAD branch name.
// Returns "main" as a safe fallback if detection fails.
func detectGitBranch(root string) string {
	headFile := filepath.Join(root, ".git", "HEAD")

	data, err := os.ReadFile(headFile) //nolint:gosec // fixed path
	if err != nil {
		return "main"
	}

	line := strings.TrimSpace(string(data))

	const prefix = "ref: refs/heads/"
	if strings.HasPrefix(line, prefix) {
		return strings.TrimPrefix(line, prefix)
	}

	return "main"
}

// =============================================================================
// attach — connect to a noskills-server session via WebTransport
// =============================================================================

func runAttach(args []string) error {
	daemon := "https://localhost:4433"
	token := os.Getenv("NOSKILLS_TOKEN")

	var sessionID, certHashHex, slug string

	for _, arg := range args {
		switch {
		case strings.HasPrefix(arg, "--daemon="):
			daemon = strings.TrimPrefix(arg, "--daemon=")
		case strings.HasPrefix(arg, "--token="):
			token = strings.TrimPrefix(arg, "--token=")
		case strings.HasPrefix(arg, "--session="):
			sessionID = strings.TrimPrefix(arg, "--session=")
		case strings.HasPrefix(arg, "--cert-hash="):
			certHashHex = strings.TrimPrefix(arg, "--cert-hash=")
		case !strings.HasPrefix(arg, "-"):
			if slug == "" {
				slug = arg
			}
		}
	}

	if slug == "" {
		return fmt.Errorf("attach: required: <slug> (e.g. noskills attach my-project)")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. Resolve cert fingerprint for pinning
	var certHashes [][]byte

	if certHashHex != "" {
		b, err := hex.DecodeString(strings.ReplaceAll(certHashHex, ":", ""))
		if err != nil {
			return fmt.Errorf("attach: --cert-hash: %w", err)
		}

		certHashes = [][]byte{b}
	} else {
		h, err := attachBootstrapCert(ctx, daemon)
		if err != nil {
			fmt.Fprintf(os.Stderr, "warning: cert fingerprint unavailable (%v) — proceeding without pinning\n", err)
		} else if len(h) > 0 {
			certHashes = [][]byte{h}
			fmt.Fprintf(os.Stderr, "cert: pinned %s\n", hex.EncodeToString(h))
		}
	}

	// 2. HTTP/3 client for REST calls
	httpCli := attachBuildHTTPClient(certHashes)

	// 3. Ensure we have a session ID
	if sessionID == "" {
		var err error

		sessionID, err = attachCreateSession(ctx, httpCli, daemon, slug, token)
		if err != nil {
			return fmt.Errorf("attach: create session: %w", err)
		}

		fmt.Fprintf(os.Stderr, "session: %s\n", sessionID)
	}

	// 4. Open WebTransport bidi stream
	var wtOpts []webtransportfx.Option
	if len(certHashes) > 0 {
		wtOpts = append(wtOpts, webtransportfx.WithCertHashes(certHashes))
	}

	wtClient := webtransportfx.NewClient(wtOpts...)
	defer func() { _ = wtClient.Close() }()

	tokenParam := ""
	if token != "" {
		tokenParam = "?token=" + neturl.QueryEscape(token)
	}

	attachURL := fmt.Sprintf("%s/attach/%s/%s%s",
		daemon, neturl.PathEscape(slug), neturl.PathEscape(sessionID), tokenParam)

	sess, err := wtClient.Connect(ctx, attachURL)
	if err != nil {
		return fmt.Errorf("attach: WebTransport connect: %w", err)
	}

	defer func() { _ = sess.Close() }()

	stream, err := sess.OpenBidiStreamSync(ctx)
	if err != nil {
		return fmt.Errorf("attach: open bidi stream: %w", err)
	}

	fmt.Fprintf(os.Stderr, "attached to %s/%s  (type a message, Ctrl-D or Ctrl-C to quit)\n\n", slug, sessionID)

	return attachInteractiveLoop(ctx, cancel, stream)
}

// attachBootstrapCert fetches /api/cert-fingerprint with InsecureSkipVerify
// to bootstrap cert pinning without requiring the user to trust the self-signed
// CA first. The returned hash is then used for all subsequent connections.
func attachBootstrapCert(ctx context.Context, daemon string) ([]byte, error) {
	tlsCfg := &tls.Config{ //nolint:exhaustruct
		InsecureSkipVerify: true, //nolint:gosec // intentional: bootstrap-only before fingerprint is known
	}

	rt := httpclient.NewHTTP3RoundTripper(httpclient.WithH3TLSClientConfig(tlsCfg))

	req, err := http.NewRequestWithContext( //nolint:gosec // daemon URL is user-supplied
		ctx, http.MethodGet, daemon+"/api/cert-fingerprint", http.NoBody)
	if err != nil {
		return nil, err
	}

	resp, err := rt.RoundTrip(req)
	if err != nil {
		return nil, err
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status %d", resp.StatusCode)
	}

	var body struct {
		Fingerprint string `json:"fingerprint"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}

	if body.Fingerprint == "" {
		return nil, nil // mkcert mode — no pinning needed
	}

	return hex.DecodeString(strings.ReplaceAll(body.Fingerprint, ":", ""))
}

// attachBuildHTTPClient returns an *http.Client backed by the HTTP/3 transport.
func attachBuildHTTPClient(certHashes [][]byte) *http.Client {
	rt := httpclient.NewHTTP3RoundTripper(httpclient.WithH3CertHashes(certHashes))

	return &http.Client{Transport: rt} //nolint:exhaustruct
}

type createSessionResponse struct {
	SessionID string `json:"sessionId"`
}

// attachCreateSession calls POST /api/projects/{slug}/sessions and returns the sessionId.
func attachCreateSession(ctx context.Context, cli *http.Client, daemon, slug, token string) (string, error) {
	u := fmt.Sprintf("%s/api/projects/%s/sessions", daemon, neturl.PathEscape(slug))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, //nolint:gosec // daemon URL is user-supplied
		bytes.NewBufferString("{}"))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Protocol-Version", "1")

	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := cli.Do(req) //nolint:gosec // daemon URL is user-supplied
	if err != nil {
		return "", err
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))

		return "", fmt.Errorf("status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var r createSessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&r); err != nil {
		return "", err
	}

	return r.SessionID, nil
}

// attachInteractiveLoop runs two concurrent goroutines:
//   - stdin → stream (user_message commands)
//   - stream → stdout (render daemon events)
//
// Returns the first stream read error (excluding io.EOF which means clean close).
func attachInteractiveLoop(
	ctx context.Context,
	cancel context.CancelFunc,
	stream io.ReadWriter,
) error {
	errCh := make(chan error, 1)

	// stdin → stream
	go func() {
		defer cancel()

		scanner := bufio.NewScanner(os.Stdin)
		enc := json.NewEncoder(stream)

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}

			msg := map[string]any{"type": "user_message", "content": line}
			if encErr := enc.Encode(msg); encErr != nil {
				fmt.Fprintf(os.Stderr, "send error: %v\n", encErr)

				return
			}
		}
	}()

	// stream → stdout
	go func() {
		defer cancel()

		dec := json.NewDecoder(stream)

		for {
			select {
			case <-ctx.Done():
				errCh <- nil
				return
			default:
			}

			var evt map[string]json.RawMessage
			if decErr := dec.Decode(&evt); decErr != nil {
				if decErr == io.EOF {
					errCh <- nil
				} else {
					errCh <- decErr
				}

				return
			}

			attachRenderEvent(evt)
		}
	}()

	return <-errCh
}

// attachRenderEvent prints a single daemon event to stdout.
func attachRenderEvent(evt map[string]json.RawMessage) {
	var evtType string

	if raw, ok := evt["type"]; ok {
		_ = json.Unmarshal(raw, &evtType)
	}

	switch evtType {
	case "delta":
		var text string
		if raw, ok := evt["text"]; ok {
			_ = json.Unmarshal(raw, &text)
		}

		fmt.Print(text)

	case "tool_start":
		var tool string
		if raw, ok := evt["tool"]; ok {
			_ = json.Unmarshal(raw, &tool)
		}

		fmt.Fprintf(os.Stderr, "\n[tool: %s]\n", tool)

	case "tool_result":
		fmt.Fprint(os.Stderr, "[tool done]\n")

	case "permission_request":
		var tool, id string
		if raw, ok := evt["tool"]; ok {
			_ = json.Unmarshal(raw, &tool)
		}

		if raw, ok := evt["id"]; ok {
			_ = json.Unmarshal(raw, &id)
		}

		fmt.Fprintf(os.Stderr, "\n[permission] allow %q? [y/N]: ", tool)

		scanner := bufio.NewScanner(os.Stdin)
		if scanner.Scan() && strings.ToLower(strings.TrimSpace(scanner.Text())) == "y" {
			fmt.Fprintf(os.Stderr, "(allowed)\n")
		} else {
			fmt.Fprintf(os.Stderr, "(denied)\n")
		}

	case "session_meta":
		// silently acknowledged
	case "transcript_replay_start":
		fmt.Fprint(os.Stderr, "── replaying transcript ──\n")
	case "transcript_replay_end":
		fmt.Fprint(os.Stderr, "── live ──\n\n")
	case "spawn_progress":
		var stage string
		if raw, ok := evt["stage"]; ok {
			_ = json.Unmarshal(raw, &stage)
		}

		fmt.Fprintf(os.Stderr, "[worker %s]\n", stage)

	case "worker_died":
		fmt.Fprint(os.Stderr, "\n[worker died — session may need to be restarted]\n")
	case "error":
		var code, msg string
		if raw, ok := evt["code"]; ok {
			_ = json.Unmarshal(raw, &code)
		}

		if raw, ok := evt["message"]; ok {
			_ = json.Unmarshal(raw, &msg)
		}

		fmt.Fprintf(os.Stderr, "\n[error %s: %s]\n", code, msg)

	default:
		// unknown event — silently skip
	}
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// `spec <name> section` (TASK-325, the section subcommand of
// commands/spec.ts): the sections the completeness gate checks, and filling
// one or marking it N/A with what the user said. The state is the record
// the gate reads; spec.md is its view.

// SpecSectionEntry is a section as `section list` prints it.
type SpecSectionEntry struct {
	ID     string
	Title  string
	Status string
	// Symbol is the TOC's symbol for the status.
	Symbol string
	// Note is " (N/A: reason)", " (hidden: condition not met)" or "".
	Note string
}

// SpecSections are the placeholder sections of a spec, in order.
func SpecSections(e *LifecycleEnv, specName string) ([]SpecSectionEntry, error) {
	manifest, _ := readManifestSection(e.Root)

	state, err := ResolveState(e.Root, specName, CommandPrefixOf(manifest), e.Warn)
	if err != nil {
		return nil, err
	}

	placeholders := objectsOf(state.objOrEmpty("specState").arr("placeholders"))
	entries := make([]SpecSectionEntry, 0, len(placeholders))

	for _, p := range placeholders {
		status := p.str("status")
		entry := SpecSectionEntry{
			ID: p.str("sectionId"), Title: p.str("sectionTitle"), Status: status, Symbol: placeholderSymbol(status), Note: "",
		}

		reason, hasReason := p.strOK("naReason")

		switch {
		case status == "na" && hasReason:
			entry.Note = " (N/A: " + reason + ")"
		case status == "conditional-hidden":
			entry.Note = " (hidden: condition not met)"
		}

		entries = append(entries, entry)
	}

	return entries, nil
}

// The actions of `section <id> <action> "text"`.
const (
	SectionFill = "fill"
	SectionNA   = "na"
)

// SectionResult is what `section <id> fill | na` did.
type SectionResult struct {
	Title string
	User  User
	// FileUpdated is false when spec.md is missing or holds no marker for
	// the section; the state records it either way.
	FileUpdated bool
	// Open are the ids of the sections the gate still finds unresolved.
	Open []string
	// PendingDecisions is how many decisions still block the gate.
	PendingDecisions int
}

// ResolveSpecSection is `spec <name> section <id> fill "text"` and
// `section <id> na "reason"`: after the checks (the action and its text,
// the phase, a known and visible section that is still open, and an N/A
// reason the gate accepts), it marks the placeholder filled or N/A, writes
// spec.md, and writes the spec's state file and state.json when that names
// the spec.
func ResolveSpecSection(ctx context.Context, e *LifecycleEnv, specName, sectionID, action, text string) (SectionResult, error) { //nolint:cyclop,funlen // the checks of resolveSection, in order
	root := e.Root
	manifest, _ := readManifestSection(root)
	prefix := CommandPrefixOf(manifest)

	state, err := ResolveState(root, specName, prefix, e.Warn)
	if err != nil {
		return SectionResult{}, err
	}

	if action != SectionFill && action != SectionNA {
		return SectionResult{}, refuse("usage",
			"Usage: "+prefix+" spec "+specName+` section <list | <id> fill "text" | <id> na "reason">`)
	}

	text = jsTrim(text)
	if text == "" {
		if action == SectionFill {
			return SectionResult{}, refuse("text", "Please provide the section text.")
		}

		return SectionResult{}, refuse("text", "Please provide the reason the section does not apply.")
	}

	if phase := phaseOf(state); phase != PhaseDiscovery && phase != PhaseDiscoveryRefinement {
		return SectionResult{}, refuse("phase", "Cannot change spec sections in phase "+phase+".",
			"The completeness gate checks them during DISCOVERY and DISCOVERY_REFINEMENT.")
	}

	specState := state.objOrEmpty("specState")
	placeholders := specState.arr("placeholders")

	var placeholder *JSObject

	valid := []string{}

	for _, p := range objectsOf(placeholders) {
		if placeholder == nil && p.str("sectionId") == sectionID {
			placeholder = p
		}

		if p.str("status") != "conditional-hidden" {
			valid = append(valid, p.str("sectionId"))
		}
	}

	if placeholder == nil {
		list := "none"
		if len(valid) > 0 {
			list = strings.Join(valid, ", ")
		}

		return SectionResult{}, refuse("unknown", "Unknown section: "+sectionID, "  Valid: "+list)
	}

	if placeholder.str("status") == "conditional-hidden" {
		return SectionResult{}, refuse("hidden",
			"Section "+sectionID+" is hidden: its condition is not met, so the gate does not check it.")
	}

	if !containsUnresolved(CheckSpecCompletenessObject(specState).Unresolved, sectionID) {
		return SectionResult{}, refuse("resolved", "Section "+sectionID+" is already resolved.")
	}

	if length := jsLength(text); action == SectionNA && length < minNAReason {
		return SectionResult{}, refuse("reason", naReasonTooShort(sectionID, length))
	}

	user := e.ResolveUser(ctx)
	nowISO := e.nowISO()

	var updated []any
	if action == SectionFill {
		updated = markPlaceholderFilled(placeholders, sectionID, user.Name, nowISO)
	} else {
		updated = markPlaceholderNa(placeholders, sectionID, text, user.Name, nowISO)
	}

	metadata := applyMetadataAction(specState.objOrEmpty("metadata"), "answer", user.Name, nowISO)
	newSpecState := specState.with("placeholders", updated, "metadata", metadata)
	next := state.with("specState", newSpecState)

	result := SectionResult{Title: placeholder.str("sectionTitle"), User: user, FileUpdated: false}

	if path, ok := specState.strOK("path"); ok {
		update := &livingAnswerUpdate{
			Path:            filepath.Join(root, filepath.FromSlash(path)),
			SectionID:       sectionID,
			Body:            text,
			User:            user.Name,
			NowISO:          nowISO,
			Metadata:        metadata,
			Placeholders:    updated,
			Changed:         false,
			RevealedSection: nil,
			HiddenIDs:       nil,
		}

		if action == SectionFill {
			result.FileUpdated = applyAnswerToFile(update) == nil
		} else {
			result.FileUpdated = applyNaToFile(update) == nil
		}
	}

	// state.json moves with the spec it names; a state.json on another
	// spec stays.
	write := func() error { return WriteSpecStateObject(root, specName, next, e.Warn) }
	if global, _ := ReadHookState(root, e.Warn).strOK("spec"); global == specName {
		write = func() error { return WriteStateAndSpec(root, next, e.Warn) }
	}

	if err := write(); err != nil {
		return SectionResult{}, err
	}

	after := CheckSpecCompletenessObject(newSpecState)
	for _, s := range after.Unresolved {
		result.Open = append(result.Open, s.ID)
	}

	result.PendingDecisions = len(after.PendingDecisions)

	return result, nil
}

func containsUnresolved(sections []UnresolvedSection, id string) bool {
	for _, s := range sections {
		if s.ID == id {
			return true
		}
	}

	return false
}

// minNAReason is the shortest N/A reason the completeness gate accepts.
const minNAReason = 20

// naReasonTooShort is markPlaceholderNa's message for a reason under
// minNAReason characters.
func naReasonTooShort(sectionID string, length int) string {
	return fmt.Sprintf(`N/A reason for "%s" is too short (%d chars, minimum %d). `, sectionID, length, minNAReason) +
		"Provide a specific reason why this section does not apply. " +
		"Vague N/As are hand-waving — the Jidoka gate will reject them."
}

// markPlaceholderNa is markPlaceholderNa for a reason the caller checked:
// the section becomes N/A with the trimmed reason, who marked it and when.
func markPlaceholderNa(placeholders []any, sectionID, reason, user, nowISO string) []any {
	out := make([]any, len(placeholders))

	for i, item := range placeholders {
		p, ok := item.(*JSObject)
		if ok && p.str("sectionId") == sectionID {
			out[i] = p.with("status", "na", "naReason", jsTrim(reason), "naBy", user, "naAt", nowISO)
		} else {
			out[i] = item
		}
	}

	return out
}

// applyNaToFile is applyNaToFile: the section's placeholder in spec.md
// becomes the N/A line, and the TOC and frontmatter are rendered again.
// Body is the reason.
func applyNaToFile(u *livingAnswerUpdate) error {
	raw, err := os.ReadFile(u.Path)
	if err != nil {
		return fmt.Errorf("read %s: %w", u.Path, err)
	}

	body, err := frontmatterBody(string(raw))
	if err != nil {
		return err
	}

	marker := PlaceholderMarker(u.SectionID)
	if !strings.Contains(body, marker) {
		return fmt.Errorf("%w for section %q", errMarkerAbsent, u.SectionID)
	}

	date, _, _ := strings.Cut(u.NowISO, "T")
	body = jsReplaceFirstString(body, marker, "_Marked N/A by "+u.User+" on "+date+": "+u.Body+"_")
	body = replaceLivingTOC(body, u.Placeholders)

	if err := os.WriteFile(u.Path, []byte(renderFrontmatterObject(u.Metadata)+"\n"+body), stateFilePerm); err != nil { //nolint:gosec // G306: spec.md is not secret
		return fmt.Errorf("write %s: %w", u.Path, err)
	}

	return nil
}

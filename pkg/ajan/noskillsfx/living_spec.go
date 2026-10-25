// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
)

// The living spec (spec/living.ts): .eser/specs/<name>/spec.md, written at
// `spec new` with one placeholder per section and filled in as discovery
// answers arrive. The state's specState is the record the completeness gate
// reads; spec.md is the view of it. Placeholders and metadata are kept as the
// JSON objects the state file holds.

// livingSection is a section of the spec: a base one or one a concern adds.
type livingSection struct {
	ID          string
	Title       string
	Placeholder string
	Scope       []ConcernScope
	Condition   *string
	Position    string
	// ConcernSource is the id of the concern that added the section, or ""
	// for a base section.
	ConcernSource string
}

var (
	nonSlugRun      = regexp.MustCompile(`[^a-z0-9]+`)     //nolint:gochecknoglobals // compiled once
	afterAnchor     = regexp.MustCompile(`^after:([^:]+)`) //nolint:gochecknoglobals // compiled once
	errMarkerAbsent = errors.New("placeholder marker not found")
)

// legacySectionSlug is the id part of a section given as a plain string.
func legacySectionSlug(title string) string {
	slug := nonSlugRun.ReplaceAllString(jsToLower(title), "-")
	slug = strings.TrimPrefix(slug, "-")

	return strings.TrimSuffix(slug, "-")
}

// normalizeLivingSection is normalizeSection in living.ts; placeholderText
// is the text a plain-string section gets.
func normalizeLivingSection(concernID string, raw any, idx int, placeholderText func(title string) string) livingSection {
	if title, ok := raw.(string); ok {
		return livingSection{
			ID:          concernID + "-" + legacySectionSlug(title),
			Title:       title,
			Placeholder: placeholderText(title),
			Position:    fmt.Sprintf("after:tasks:%d", idx),
		}
	}

	m, _ := raw.(map[string]any)
	section := livingSection{}
	section.ID, _ = m["id"].(string)
	section.Title, _ = m["title"].(string)
	section.Placeholder, _ = m["placeholder"].(string)
	section.Position, _ = m["position"].(string)

	if condition, ok := m["condition"].(string); ok {
		section.Condition = &condition
	}

	if scope, ok := sectionScope(m); ok {
		section.Scope = scope
	}

	return section
}

// mergeLivingSections is mergeSections: the base sections, each followed by
// the concern sections anchored after it; a section with an unknown anchor
// comes after the acceptance criteria.
func mergeLivingSections(activeConcerns []ConcernDefinition) []livingSection {
	baseIDs := map[string]bool{}
	for _, base := range BaseSections {
		baseIDs[base.ID] = true
	}

	insertAfter := map[string][]livingSection{}

	for _, concern := range activeConcerns {
		for i, raw := range concern.SpecSections {
			section := normalizeLivingSection(concern.ID, raw, i, func(title string) string {
				return "_" + title + ": to be addressed during discovery._"
			})
			section.ConcernSource = concern.ID

			anchor := "acceptance-criteria"
			if m := afterAnchor.FindStringSubmatch(section.Position); m != nil && baseIDs[m[1]] {
				anchor = m[1]
			}

			insertAfter[anchor] = append(insertAfter[anchor], section)
		}
	}

	out := make([]livingSection, 0, len(BaseSections))

	for _, base := range BaseSections {
		out = append(out, livingSection{
			ID: base.ID, Title: base.Title, Placeholder: base.Placeholder, Position: base.Position,
		})
		out = append(out, insertAfter[base.ID]...)
	}

	return out
}

func (s *livingSection) conditional() bool {
	return len(s.Scope) > 0 || s.Condition != nil
}

// visible is isSectionVisible: an unconditional section always is, a
// conditional one only under a classification that matches it.
func (s *livingSection) visible(classification *SpecClassification) bool {
	if !s.conditional() {
		return true
	}

	return classification != nil && sectionMatchesClassification(s.Scope, s.Condition, classification)
}

// classificationFromObject reads a classification object as the scope
// checks use it: each flag true only when it is the boolean true; nil for
// no object.
func classificationFromObject(o *JSObject) *SpecClassification {
	if o == nil {
		return nil
	}

	return &SpecClassification{
		InvolvesWebUI:        o.isTrue("involvesWebUI"),
		InvolvesCLI:          o.isTrue("involvesCLI"),
		InvolvesPublicAPI:    o.isTrue("involvesPublicAPI"),
		InvolvesMigration:    o.isTrue("involvesMigration"),
		InvolvesDataHandling: o.isTrue("involvesDataHandling"),
	}
}

func placeholderSymbol(status string) string {
	switch status {
	case "filled":
		return "✓"
	case "placeholder":
		return "○"
	case "na":
		return "—"
	case "conditional-hidden":
		return "⊘"
	default:
		return "undefined"
	}
}

// renderLivingTOC is renderTOC.
func renderLivingTOC(placeholders []any) string {
	lines := []string{tocStart, "## Sections"}

	for _, p := range objectsOf(placeholders) {
		status := p.str("status")
		symbol := placeholderSymbol(status)

		reason, hasReason := p.strOK("naReason")

		switch {
		case status == "na" && hasReason:
			lines = append(lines, "- "+symbol+" "+p.str("sectionTitle")+" _(N/A: "+reason+")_")
		case status == "conditional-hidden":
			lines = append(lines, "- "+symbol+" "+p.str("sectionTitle")+" _(hidden — condition not met)_")
		default:
			lines = append(lines, "- "+symbol+" "+p.str("sectionTitle"))
		}
	}

	return strings.Join(append(lines, tocEnd), "\n")
}

// replaceLivingTOC is replaceTOCBlock.
func replaceLivingTOC(content string, placeholders []any) string {
	start := strings.Index(content, tocStart)
	end := strings.Index(content, tocEnd)

	if start == -1 || end == -1 {
		return content
	}

	return content[:start] + renderLivingTOC(placeholders) + content[end+len(tocEnd):]
}

// renderFrontmatterObject is renderFrontmatter: the metadata as a YAML block
// between --- lines, without a trailing newline.
func renderFrontmatterObject(metadata *JSObject) string {
	return frontmatterDelimiter + "\n" + strings.TrimRight(yamlStringify(metadata, 0), " \t\n\r") + "\n" + frontmatterDelimiter
}

// frontmatterBody is parseFrontmatter's body: the text after the closing
// ---, or the whole content when it has no frontmatter. A frontmatter that
// does not close, or does not parse, is an error.
func frontmatterBody(content string) (string, error) {
	lines := strings.Split(content, "\n")
	if lines[0] != frontmatterDelimiter {
		return content, nil
	}

	end := -1

	for i := 1; i < len(lines); i++ {
		if lines[i] == frontmatterDelimiter {
			end = i

			break
		}
	}

	if end == -1 {
		return "", errors.New("spec.md frontmatter is malformed: found opening --- but no closing ---") //nolint:err113 // the TypeScript message
	}

	if _, err := parseYAMLCore(strings.Join(lines[1:end], "\n")); err != nil {
		return "", fmt.Errorf("parse the spec.md frontmatter: %w", err)
	}

	return strings.Join(lines[end+1:], "\n"), nil
}

// InitialSpec is what `spec new` writes: spec.md and the specState fields
// that describe it.
type InitialSpec struct {
	Content      string
	Placeholders []any
	Metadata     *JSObject
}

// GenerateInitialSpecObject is generateInitialSpec: spec.md with a
// placeholder for every section the classification shows, and the
// placeholder states and metadata to store. nowISO is the creation time.
func GenerateInitialSpecObject(specName string, activeConcerns []ConcernDefinition, classification *JSObject, creator, nowISO string) InitialSpec {
	sections := mergeLivingSections(activeConcerns)
	cl := classificationFromObject(classification)
	placeholders := make([]any, 0, len(sections))

	for _, section := range sections {
		status := "conditional-hidden"
		if section.visible(cl) {
			status = "placeholder"
		}

		p := JSObjectOf("sectionId", section.ID, "sectionTitle", section.Title, "status", status)
		if section.ConcernSource != "" {
			p.set("concernSource", section.ConcernSource)
		}

		placeholders = append(placeholders, p)
	}

	metadata := JSObjectOf(
		"created", JSObjectOf("date", nowISO, "user", creator),
		"lastModified", JSObjectOf("date", nowISO, "user", creator),
		"contributors", []any{JSObjectOf("user", creator, "lastAction", "created", "date", nowISO)},
		"approvals", []any{},
		"pendingDecisions", []any{},
	)

	parts := []string{renderFrontmatterObject(metadata), "# Spec: " + specName, renderLivingTOC(placeholders)}

	for i, section := range sections {
		if placeholders[i].(*JSObject).str("status") == "conditional-hidden" { //nolint:forcetypeassert // built above
			continue
		}

		parts = append(parts, "## "+section.Title+"\n\n"+PlaceholderMarker(section.ID)+"\n"+section.Placeholder)
	}

	return InitialSpec{Content: strings.Join(parts, "\n\n"), Placeholders: placeholders, Metadata: metadata}
}

// markPlaceholderFilled is markPlaceholderFilled with the STATED source.
func markPlaceholderFilled(placeholders []any, sectionID, user, nowISO string) []any {
	out := make([]any, len(placeholders))

	for i, item := range placeholders {
		p, ok := item.(*JSObject)
		if ok && p.str("sectionId") == sectionID {
			out[i] = p.with("status", "filled", "filledBy", user, "filledAt", nowISO, "source", "STATED")
		} else {
			out[i] = item
		}
	}

	return out
}

// applyClassificationToPlaceholders flips conditional sections between
// conditional-hidden and placeholder as the classification changes; filled
// and N/A sections stay.
func applyClassificationToPlaceholders(placeholders []any, sections []livingSection, classification *JSObject) []any {
	defs := map[string]*livingSection{}
	for i := range sections {
		defs[sections[i].ID] = &sections[i]
	}

	cl := classificationFromObject(classification)
	out := make([]any, len(placeholders))

	for i, item := range placeholders {
		out[i] = item

		p, ok := item.(*JSObject)
		if !ok {
			continue
		}

		def := defs[p.str("sectionId")]
		if def == nil || !def.conditional() {
			continue
		}

		status := p.str("status")
		if status == "filled" || status == "na" {
			continue
		}

		visible := def.visible(cl)

		switch {
		case visible && status == "conditional-hidden":
			out[i] = p.with("status", "placeholder")
		case !visible && status == "placeholder":
			out[i] = p.with("status", "conditional-hidden")
		}
	}

	return out
}

// applyMetadataAction is applyMetadataAction for the answer, note and
// approval actions: lastModified and the contributor entry change; an
// approval also upserts the user's approval.
func applyMetadataAction(metadata *JSObject, action, user, nowISO string) *JSObject {
	lastModified := JSObjectOf("date", nowISO, "user", user)
	entry := JSObjectOf("user", user, "lastAction", action, "date", nowISO)

	contributors := metadata.arr("contributors")
	updated := make([]any, 0, len(contributors)+1)
	replaced := false

	for _, item := range contributors {
		if c, ok := item.(*JSObject); ok && !replaced && c.str("user") == user {
			updated = append(updated, entry)
			replaced = true

			continue
		}

		updated = append(updated, item)
	}

	if !replaced {
		updated = append(updated, entry)
	}

	out := metadata.with("lastModified", lastModified, "contributors", updated)

	if action == "approval" {
		approval := JSObjectOf("user", user, "status", "approved", "date", nowISO)
		approvals := metadata.arr("approvals")
		next := make([]any, 0, len(approvals)+1)
		found := false

		for _, item := range approvals {
			if a, ok := item.(*JSObject); ok && !found && a.str("user") == user {
				next = append(next, approval)
				found = true

				continue
			}

			next = append(next, item)
		}

		if !found {
			next = append(next, approval)
		}

		out.set("approvals", next)
	}

	return out
}

// visibleSectionIDs are the ids of the placeholders that are not hidden, in
// order.
func visibleSectionIDs(placeholders []any) []string {
	var ids []string

	for _, p := range objectsOf(placeholders) {
		if p.str("status") != "conditional-hidden" {
			ids = append(ids, p.str("sectionId"))
		}
	}

	return ids
}

// revealedAndHidden compares two placeholder lists: the sections that
// became visible and the ones that became hidden.
func revealedAndHidden(previous, next []any) (revealed, hidden []string) {
	before := visibleSectionIDs(previous)
	after := visibleSectionIDs(next)

	for _, id := range after {
		if !containsString(before, id) {
			revealed = append(revealed, id)
		}
	}

	for _, id := range before {
		if !containsString(after, id) {
			hidden = append(hidden, id)
		}
	}

	return revealed, hidden
}

// CompletenessReport is checkSpecCompleteness: the sections still open and
// the pending decisions.
type CompletenessReport struct {
	CanAdvance       bool
	Unresolved       []UnresolvedSection
	PendingDecisions []*JSObject
}

// UnresolvedSection is a spec section that still needs a value or an N/A.
type UnresolvedSection struct {
	ID    string
	Title string
}

// CheckSpecCompletenessObject reads specState as the completeness gate does:
// hidden and filled sections are resolved, an N/A needs a reason of at
// least 20 characters, and any pending decision blocks.
func CheckSpecCompletenessObject(specState *JSObject) CompletenessReport {
	placeholders := objectsOf(specState.arr("placeholders"))
	unresolved := make([]UnresolvedSection, 0, len(placeholders))

	for _, p := range placeholders {
		switch p.str("status") {
		case "conditional-hidden", "filled":
			continue
		case "na":
			if reason, ok := p.strOK("naReason"); ok && jsLength(jsTrim(reason)) >= 20 {
				continue
			}
		}

		unresolved = append(unresolved, UnresolvedSection{ID: p.str("sectionId"), Title: p.str("sectionTitle")})
	}

	pending := objectsOf(specState.objOrEmpty("metadata").arr("pendingDecisions"))

	return CompletenessReport{
		CanAdvance:       len(unresolved) == 0 && len(pending) == 0,
		Unresolved:       unresolved,
		PendingDecisions: pending,
	}
}

// livingAnswerUpdate is what applyAnswerToFile writes into spec.md.
type livingAnswerUpdate struct {
	Path            string
	SectionID       string
	Body            string
	User            string
	NowISO          string
	Metadata        *JSObject
	Placeholders    []any
	Changed         bool
	RevealedSection []livingSection
	HiddenIDs       []string
}

// applyAnswerToFile replaces a section's placeholder in spec.md with the
// answer and its attribution, renders the TOC and frontmatter again, and
// adds or removes the sections the classification revealed or hid.
func applyAnswerToFile(u *livingAnswerUpdate) error {
	raw, err := os.ReadFile(u.Path)
	if err != nil {
		return fmt.Errorf("read %s: %w", u.Path, err)
	}

	body, err := frontmatterBody(string(raw))
	if err != nil {
		return err
	}

	date, _, _ := strings.Cut(u.NowISO, "T")
	answer := u.Body + "\n\n_Answered by " + u.User + " on " + date + "_"

	marker := PlaceholderMarker(u.SectionID)
	if !strings.Contains(body, marker) {
		return fmt.Errorf("%w for section %q", errMarkerAbsent, u.SectionID)
	}

	body = jsReplaceFirstString(body, marker, answer)
	body = replaceLivingTOC(body, u.Placeholders)

	if u.Changed {
		for _, section := range u.RevealedSection {
			body += "\n\n## " + section.Title + "\n\n" + PlaceholderMarker(section.ID) + "\n" + section.Placeholder
		}

		for _, id := range u.HiddenIDs {
			body = removeSectionBlock(body, id)
		}
	}

	if err := os.WriteFile(u.Path, []byte(renderFrontmatterObject(u.Metadata)+"\n"+body), stateFilePerm); err != nil { //nolint:gosec // G306: spec.md is not secret
		return fmt.Errorf("write %s: %w", u.Path, err)
	}

	return nil
}

var sectionHeading = regexp.MustCompile(`\n## [^\n]+\n`) //nolint:gochecknoglobals // compiled once

// removeSectionBlock drops a hidden section's heading and marker line.
func removeSectionBlock(body, sectionID string) string {
	marker := PlaceholderMarker(sectionID)

	at := strings.Index(body, marker)
	if at == -1 {
		return body
	}

	before := body[:at]

	headingStart := strings.LastIndex(before, "\n## ")
	if headingStart == -1 || !sectionHeading.MatchString(before[headingStart:]) {
		return body
	}

	// A marker on the last line: indexOf gives -1, and -1 + 1 keeps the
	// whole body after the heading's start, as the TypeScript slice does.
	lineEnd := strings.Index(body[at:], "\n")
	if lineEnd == -1 {
		return body[:headingStart] + body
	}

	return body[:headingStart] + body[at+lineEnd+1:]
}

// createSpecSnapshot copies spec.md to a write-once snapshot; an existing
// snapshot stays.
func createSpecSnapshot(source, target string) error {
	if _, err := os.Stat(target); err == nil {
		return nil
	}

	data, err := os.ReadFile(source) //nolint:gosec // G304: the spec of the project
	if err != nil {
		return fmt.Errorf("read %s: %w", source, err)
	}

	if err := os.WriteFile(target, data, stateFilePerm); err != nil { //nolint:gosec // G306: spec snapshots are not secret
		return fmt.Errorf("write %s: %w", target, err)
	}

	return nil
}

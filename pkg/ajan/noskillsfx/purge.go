// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"strconv"
	"strings"
)

// `noskills purge` (commands/purge.ts): it finds each category of noskills
// content, moves what it removes into the purge history unless asked not
// to, and takes noskills' part out of the files it shares with the user.

// PurgeDetection is what purge found of one category. Message is the
// question purge asks before taking it, or "" when it does not ask (the
// manifest section goes with any category the user confirms).
type PurgeDetection struct {
	Category PurgeCategory
	Exists   bool
	Message  string
}

// PurgeOutcome is what purging one category did.
type PurgeOutcome struct {
	Category PurgeCategory
	Removed  bool
	Errors   []string
}

type purgeStep struct {
	removed bool
	err     string
}

// sharedFile is a file that holds noskills' part next to the user's own
// content. strip returns the text without noskills' part ("" when nothing
// is left) and ok false when the file holds no noskills part; it fails on a
// file it cannot parse.
type sharedFile struct {
	file  string
	strip func(content string) (rest string, ok bool, err error)
}

func sharedFiles() []sharedFile {
	return []sharedFile{
		{"CLAUDE.md", withoutMarkedSection},
		{"AGENTS.md", withoutMarkedSection},
		{".claude/settings.json", jsonStrip(withoutNoskillsHooks)},
		{".codex/hooks.json", jsonStrip(withoutNoskillsHooks)},
		{".codex/config.toml", withoutMcpTable},
		{".copilot/mcp.json", jsonStrip(withoutMcpServer("mcpServers"))},
		{".kiro/settings/mcp.json", jsonStrip(withoutMcpServer("mcpServers"))},
		{"opencode.json", jsonStrip(withoutMcpServer("mcp"))},
	}
}

// withoutMarkedSection takes the section between the noskills markers out
// of CLAUDE.md or AGENTS.md.
func withoutMarkedSection(content string) (string, bool, error) {
	start := strings.Index(content, noskillsSectionStart)
	if start == -1 {
		return "", false, nil
	}

	end := strings.Index(content[start:], noskillsSectionEnd)
	if end == -1 {
		return "", false, nil
	}

	end += start

	rest := jsTrimEnd(content[:start]) + "\n" + jsTrimStart(content[end+len(noskillsSectionEnd):])
	if jsTrim(rest) == "" {
		return "", true, nil
	}

	return jsTrimEnd(rest) + "\n", true, nil
}

func withoutMcpTable(content string) (string, bool, error) {
	rest := WithoutNoskillsMcpTable(content)
	if rest == content {
		return "", false, nil
	}

	if jsTrim(rest) == "" {
		return "", true, nil
	}

	return jsTrimEnd(rest) + "\n", true, nil
}

// holdsNoskillsHook reports whether a settings file's hooks hold a handler
// that runs noskills.
func holdsNoskillsHook(hooks any) bool {
	o, ok := hooks.(*JSObject)
	if !ok {
		return false
	}

	for _, event := range o.Keys() {
		groups, _ := o.values[event].([]any)
		for _, group := range groups {
			groupObject, _ := group.(*JSObject)
			handlers := groupObject.arrOrNil("hooks")
			for _, handler := range handlers {
				if h, isHandler := handler.(*JSObject); isHandler && IsNoskillsHookCommand(h.getOr("command")) {
					return true
				}
			}
		}
	}

	return false
}

// arrOrNil is the field as an array; nil for a nil object, a missing field
// or another type.
func (o *JSObject) arrOrNil(key string) []any {
	if o == nil {
		return nil
	}

	return o.arr(key)
}

// withoutNoskillsHooks is a Claude Code or Codex settings file without
// noskills' hooks; the hooks key goes when nothing is left in it.
func withoutNoskillsHooks(settings *JSObject) (*JSObject, bool) {
	hooks := settings.getOr("hooks")
	if !holdsNoskillsHook(hooks) {
		return nil, false
	}

	userHooks := UserHookGroups(hooks)
	if len(userHooks.Keys()) == 0 {
		return settings.without("hooks"), true
	}

	return settings.with("hooks", userHooks), true
}

// withoutMcpServer is an MCP config without the noskills server under key.
func withoutMcpServer(key string) func(config *JSObject) (*JSObject, bool) {
	return func(config *JSObject) (*JSObject, bool) {
		servers := config.obj(key)
		if servers == nil || !servers.hasKey("noskills") {
			return nil, false
		}

		others := servers.without("noskills")
		if len(others.Keys()) == 0 {
			return config.without(key), true
		}

		return config.with(key, others), true
	}
}

var errSharedFileNotJSON = errors.New("is not JSON")

// jsonStrip applies edit to a JSON object file; "" when no key is left.
func jsonStrip(edit func(*JSObject) (*JSObject, bool)) func(string) (string, bool, error) {
	return func(content string) (string, bool, error) {
		parsed, err := parseJSON(content)
		if err != nil {
			return "", false, fmt.Errorf("%w (%w)", errSharedFileNotJSON, err)
		}

		doc, ok := parsed.(*JSObject)
		if !ok {
			return "", false, nil
		}

		rest, changed := edit(doc)
		if !changed {
			return "", false, nil
		}

		if len(rest.Keys()) == 0 {
			return "", true, nil
		}

		return jsonStringifyIndent(rest) + "\n", true, nil
	}
}

func readOptionalText(p string) (string, bool, error) {
	data, err := os.ReadFile(p) //nolint:gosec // G304: a file of the project purge edits
	if errors.Is(err, fs.ErrNotExist) {
		return "", false, nil
	}

	if err != nil {
		return "", false, err //nolint:wrapcheck // the caller names the file
	}

	return string(data), true, nil
}

func holdsNoskillsPart(root string, shared sharedFile) bool {
	content, ok, err := readOptionalText(projectPath(root, shared.file))
	if err != nil || !ok {
		return false
	}

	_, holds, err := shared.strip(content)

	return err == nil && holds
}

func stripSharedFile(root string, shared sharedFile) purgeStep {
	p := projectPath(root, shared.file)

	fail := func(err error) purgeStep {
		return purgeStep{removed: false, err: shared.file + ": " + DescribeError(err) + "; take noskills' part out of it yourself"}
	}

	content, ok, err := readOptionalText(p)
	if err != nil {
		return fail(err)
	}

	if !ok {
		return purgeStep{}
	}

	rest, holds, err := shared.strip(content)
	if err != nil {
		return fail(err)
	}

	if !holds {
		return purgeStep{}
	}

	if rest == "" {
		if err := os.Remove(p); err != nil {
			return fail(err)
		}
	} else if err := os.WriteFile(p, []byte(rest), 0o644); err != nil { //nolint:gosec // G306: the user's own file
		return fail(err)
	}

	return purgeStep{removed: true}
}

// ListSpecNames are the names of the spec folders in .eser/specs/.
func ListSpecNames(root string) []string {
	entries, err := os.ReadDir(projectPath(root, specsDir))
	if err != nil {
		return nil
	}

	var names []string

	for _, entry := range entries {
		if entry.IsDir() {
			names = append(names, entry.Name())
		}
	}

	return names
}

func agentIntegrationPaths(specNames []string) []string {
	paths := AgentIntegrationFiles()
	for _, name := range specNames {
		paths = append(paths, SpecMirrorFiles(name)...)
	}

	return paths
}

func hasAnyPath(root string, paths []string) bool {
	for _, p := range paths {
		if exists, err := PathExists(projectPath(root, p)); err == nil && exists {
			return true
		}
	}

	return false
}

// shownPurgeItems is how many items a question names before it counts the
// rest.
const shownPurgeItems = 6

// DetectPurgeCategories finds each category, in purge order.
func DetectPurgeCategories(root string, specNames []string, warn StateWarner) []PurgeDetection {
	return []PurgeDetection{
		detectPurgeConcerns(root, warn),
		detectPurgeSpecs(root, specNames, warn),
		detectPurgeRules(root),
		{Category: PurgeManifest, Exists: IsHookInitialized(root), Message: ""},
		detectPurgeAgentIntegration(root, specNames),
	}
}

func detectPurgeConcerns(root string, warn StateWarner) PurgeDetection {
	concerns := ListHookConcerns(root, warn)

	ids := make([]string, len(concerns))
	for i, concern := range concerns {
		ids[i] = concern.ID
	}

	message := ""
	if len(concerns) > 0 {
		message = "Remove concerns? (" + strings.Join(ids, ", ") + ")"
	}

	return PurgeDetection{Category: PurgeConcerns, Exists: hasAnyPath(root, CategoryPaths(PurgeConcerns)), Message: message}
}

func detectPurgeSpecs(root string, specNames []string, warn StateWarner) PurgeDetection {
	states := ListSpecStateObjects(root, warn)
	exists := hasAnyPath(root, CategoryPaths(PurgeSpecs))
	total := max(len(states), len(specNames))

	if total == 0 {
		message := ""
		if exists {
			message = "Remove the workflow state? (" + progressesDir + "/)"
		}

		return PurgeDetection{Category: PurgeSpecs, Exists: exists, Message: message}
	}

	if len(states) == 0 {
		return PurgeDetection{Category: PurgeSpecs, Exists: exists,
			Message: "Remove specs? (" + strconv.Itoa(total) + " spec directories)"}
	}

	details := make([]string, len(states))
	for i, entry := range states {
		phase, present := entry.State.get("phase")
		if !present {
			details[i] = entry.Name + " undefined"

			continue
		}

		details[i] = entry.Name + " " + jsString(phase)
	}

	return PurgeDetection{Category: PurgeSpecs, Exists: exists,
		Message: "Remove specs? (" + strconv.Itoa(total) + " specs: " + strings.Join(details, ", ") + ")"}
}

func detectPurgeRules(root string) PurgeDetection {
	count := 0

	if entries, err := os.ReadDir(projectPath(root, rulesDir)); err == nil {
		for _, entry := range entries {
			if entry.Type().IsRegular() {
				count++
			}
		}
	}

	message := ""
	if count > 0 {
		message = "Remove rules? (" + strconv.Itoa(count) + " active rules)"
	}

	return PurgeDetection{Category: PurgeRules, Exists: hasAnyPath(root, CategoryPaths(PurgeRules)), Message: message}
}

func detectPurgeAgentIntegration(root string, specNames []string) PurgeDetection {
	var found []string

	for _, shared := range sharedFiles() {
		if holdsNoskillsPart(root, shared) {
			found = append(found, "noskills' part of "+shared.file)
		}
	}

	for _, p := range agentIntegrationPaths(specNames) {
		if exists, err := PathExists(projectPath(root, p)); err == nil && exists {
			found = append(found, p)
		}
	}

	if len(found) == 0 {
		return PurgeDetection{Category: PurgeAgentIntegration, Exists: false, Message: ""}
	}

	shown := strings.Join(found[:min(len(found), shownPurgeItems)], ", ")
	if more := len(found) - shownPurgeItems; more > 0 {
		shown += " and " + strconv.Itoa(more) + " more"
	}

	return PurgeDetection{Category: PurgeAgentIntegration, Exists: true, Message: "Remove agent integration? (" + shown + ")"}
}

// PurgeCategoryContent takes one category out of the project. With an entry
// id, paths move into that entry and the manifest section is copied there
// first; with "" they are deleted.
func PurgeCategoryContent(root string, category PurgeCategory, entryID string, specNames []string) PurgeOutcome {
	switch category {
	case PurgeConcerns, PurgeSpecs, PurgeRules:
		return purgeOutcome(category, takePaths(root, category, CategoryPaths(category), entryID))
	case PurgeManifest:
		return takeManifestSection(root, entryID)
	case PurgeAgentIntegration:
		return takeAgentIntegration(root, entryID, specNames)
	default:
		return PurgeOutcome{Category: category, Removed: false, Errors: []string{"unknown category " + string(category)}}
	}
}

func purgeOutcome(category PurgeCategory, steps []purgeStep) PurgeOutcome {
	outcome := PurgeOutcome{Category: category, Removed: false, Errors: nil}

	for _, step := range steps {
		outcome.Removed = outcome.Removed || step.removed
		if step.err != "" {
			outcome.Errors = append(outcome.Errors, step.err)
		}
	}

	return outcome
}

func takePath(root string, category PurgeCategory, rel, entryID string) purgeStep {
	fail := func(err error) purgeStep {
		hint := ""

		var history *PurgeHistoryError
		if errors.As(err, &history) {
			hint = "; pass --no-history to delete it without a copy"
		}

		return purgeStep{removed: false, err: rel + ": " + DescribeError(err) + hint}
	}

	exists, err := PathExists(projectPath(root, rel))
	if err != nil {
		return fail(err)
	}

	if !exists {
		return purgeStep{}
	}

	if entryID == "" {
		if err := os.RemoveAll(projectPath(root, rel)); err != nil {
			return fail(err)
		}
	} else if err := keepPath(root, entryID, category, rel); err != nil {
		return fail(err)
	}

	return purgeStep{removed: true}
}

func takePaths(root string, category PurgeCategory, paths []string, entryID string) []purgeStep {
	steps := make([]purgeStep, len(paths))
	for i, p := range paths {
		steps[i] = takePath(root, category, p, entryID)
	}

	return steps
}

func takeManifestSection(root, entryID string) PurgeOutcome {
	manifestPath := projectPath(root, manifestFile)

	fail := func(message string) PurgeOutcome {
		return purgeOutcome(PurgeManifest, []purgeStep{{removed: false, err: message}})
	}

	data, err := os.ReadFile(manifestPath) //nolint:gosec // G304: the project's own manifest
	if errors.Is(err, fs.ErrNotExist) {
		return purgeOutcome(PurgeManifest, []purgeStep{{}})
	}

	if err != nil {
		return fail(manifestFile + ": " + DescribeError(err))
	}

	text := string(data)

	document, err := parseYAMLCore(text)
	if err != nil {
		return fail(manifestFile + " is not valid YAML (" + err.Error() + "); fix it, then purge again")
	}

	o, _ := document.(*JSObject)
	if !o.hasKey(manifestSectionKey) {
		return purgeOutcome(PurgeManifest, []purgeStep{{}})
	}

	block, okBlock := manifestBlock(text)
	rest, okRest := withoutManifestSection(text)

	if !okBlock || !okRest {
		return fail(manifestFile + ": the noskills section is not a block at the top level; take it out yourself")
	}

	if entryID != "" {
		if err := keepManifestSection(root, entryID, block+"\n"); err != nil {
			return fail(manifestFile + ": " + DescribeError(err))
		}
	}

	if err := writeFileAtomic(manifestPath, []byte(rest), 0o644); err != nil {
		return fail(manifestFile + ": " + DescribeError(err))
	}

	return purgeOutcome(PurgeManifest, []purgeStep{{removed: true}})
}

// removeEmptyParents removes the folders above rel that purge left empty, up
// to the project root.
func removeEmptyParents(root, rel string) {
	for dir := path.Dir(rel); dir != "." && dir != "" && dir != "/"; dir = path.Dir(dir) {
		// Remove refuses a folder that still holds files.
		if err := os.Remove(projectPath(root, dir)); err != nil {
			return
		}
	}
}

func takeAgentIntegration(root, entryID string, specNames []string) PurgeOutcome {
	if entryID != "" {
		if err := markCategory(root, entryID, PurgeAgentIntegration); err != nil {
			return purgeOutcome(PurgeAgentIntegration, []purgeStep{{removed: false, err: DescribeError(err)}})
		}
	}

	paths := agentIntegrationPaths(specNames)
	moved := takePaths(root, PurgeAgentIntegration, paths, entryID)

	shared := sharedFiles()
	edited := make([]purgeStep, len(shared))

	for i, file := range shared {
		edited[i] = stripSharedFile(root, file)
	}

	var touched []string

	for i, p := range paths {
		if moved[i].removed {
			touched = append(touched, p)
		}
	}

	for i, file := range shared {
		if edited[i].removed {
			touched = append(touched, file.file)
		}
	}

	for _, p := range touched {
		removeEmptyParents(root, p)
	}

	return purgeOutcome(PurgeAgentIntegration, append(moved, edited...))
}

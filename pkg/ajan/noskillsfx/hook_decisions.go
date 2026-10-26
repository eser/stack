// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"
)

// Hook decision logic: the pure functions behind `noskills invoke-hook`.
// Port of commands/hook-decisions.ts. The handlers in cmd/noskills read the
// hook input, load state and write the answer; every decision in between is
// here, so it is tested without stdin, stdout or a project on disk.

// HookInput is a hook's stdin JSON, or one object inside it, with no field
// checked yet.
type HookInput = *JSObject

// ParseHookInput parses a hook's stdin text. Text that is not a JSON object
// gives an empty input, which every hook treats as a call with nothing to
// check. A leading byte order mark is dropped, as TextDecoder drops it.
func ParseHookInput(text string) HookInput {
	text = strings.TrimPrefix(text, "\uFEFF")

	parsed, err := parseJSON(text)
	if err != nil {
		return NewJSObject()
	}

	if o, ok := parsed.(*JSObject); ok {
		return o
	}

	return NewJSObject()
}

// StringField is the string a field holds, or "" when it is missing or not
// a string.
func StringField(record HookInput, key string) string {
	value, _ := record.get(key)
	s, _ := value.(string)

	return s
}

func fieldObject(record HookInput, key string) (*JSObject, bool) {
	value, _ := record.get(key)
	o, ok := value.(*JSObject)

	return o, ok
}

// toolArgumentsOf reads a tool input as an object: an object as it is, a
// string that holds a JSON object parsed, any other string kept as `input`
// (a patch tool's text), nil for anything else.
func toolArgumentsOf(value any, present bool) *JSObject {
	if !present {
		return nil
	}

	switch v := value.(type) {
	case *JSObject:
		return v
	case string:
		if parsed, err := parseJSON(v); err == nil {
			if o, ok := parsed.(*JSObject); ok {
				return o
			}
		}

		return JSObjectOf("input", v)
	default:
		return nil
	}
}

// ToolNameOf is the name of the tool a tool hook guards: `tool_name`, or
// Copilot CLI's camelCase `toolName`.
func ToolNameOf(input HookInput) string {
	if name := StringField(input, "tool_name"); name != "" {
		return name
	}

	return StringField(input, "toolName")
}

// ToolInputOf is the input of the guarded tool call: `tool_input`, or
// Copilot CLI's camelCase `toolArgs`, which may be a JSON string.
func ToolInputOf(input HookInput) HookInput {
	if args := toolArgumentsOf(input.get("tool_input")); args != nil {
		return args
	}

	if args := toolArgumentsOf(input.get("toolArgs")); args != nil {
		return args
	}

	return NewJSObject()
}

// FilePathOf is the file a file tool's input names: `file_path` (Claude
// Code), `filePath` (OpenCode) or `path` (Copilot CLI, Kiro).
func FilePathOf(toolInput HookInput) string {
	for _, key := range []string{"file_path", "filePath", "path"} {
		if path := StringField(toolInput, key); path != "" {
			return path
		}
	}

	return ""
}

// HookRoot is the project a hook works in: the `cwd` the tool sends, then
// NOSKILLS_PROJECT_ROOT (envRoot, "" when unset), then the hook's own
// working directory.
func HookRoot(input HookInput, envRoot, processCwd string) string {
	if cwd := StringField(input, "cwd"); cwd != "" {
		return cwd
	}

	if envRoot != "" {
		return envRoot
	}

	return processCwd
}

// shellTools run a shell command from `tool_input.command`.
func shellTools() []string {
	return []string{"Bash", "bash", "powershell", "shell", "execute_bash", "execute_cmd"}
}

// fileTools create, change or delete files.
func fileTools() []string {
	return []string{
		"Write", "Edit", "MultiEdit", "write", "edit", "create", "str_replace_editor", "apply_patch",
		"fs_write", "fsWrite", "fs_append", "str_replace", "delete_file",
	}
}

// partialFileTools never give a file's whole new content.
func partialFileTools() []string {
	return []string{"fs_append", "delete_file"}
}

// FileEdit is a file change as the input of a Claude Code Write, Edit or
// MultiEdit call, from which ContentAfterEdit works out the new content.
type FileEdit struct {
	Tool  string // "Write", "Edit" or "MultiEdit"
	Input HookInput
}

// FileChange is one file a tool call changes. Edit is nil when the call
// does not say what the file holds afterwards: a patch, an append, a delete,
// or an input of another shape.
type FileChange struct {
	Path string
	Edit *FileEdit
}

// ToolCallKind is what a tool call is in the checks' terms.
type ToolCallKind int

const (
	// ToolCallOther is a tool the checks leave alone.
	ToolCallOther ToolCallKind = iota
	// ToolCallShell runs a shell command.
	ToolCallShell
	// ToolCallFile changes files.
	ToolCallFile
)

// ToolCall is a tool call in the terms the PreToolUse checks use.
type ToolCall struct {
	Kind    ToolCallKind
	Command string       // for ToolCallShell
	Changes []FileChange // for ToolCallFile
}

// replacementInputOf reads one text replacement in Claude Code's field
// names from Claude Code's old_string, OpenCode's oldString or the old_str
// of Copilot CLI and Kiro; nil when the value holds none.
func replacementInputOf(value any) *JSObject {
	o, ok := value.(*JSObject)
	if !ok {
		return nil
	}

	for _, keys := range [][3]string{
		{"old_string", "new_string", "replace_all"},
		{"oldString", "newString", "replaceAll"},
		{"old_str", "new_str", "replace_all"},
	} {
		oldValue, _ := o.get(keys[0])
		newValue, _ := o.get(keys[1])
		oldString, oldOK := oldValue.(string)
		newString, newOK := newValue.(string)

		if oldOK && newOK {
			all, _ := o.get(keys[2])

			return JSObjectOf("old_string", oldString, "new_string", newString, "replace_all", all == true)
		}
	}

	return nil
}

func fileEditOf(toolName string, toolInput HookInput) *FileEdit {
	if slices.Contains(partialFileTools(), toolName) {
		return nil
	}

	// Kiro's write tool may name its operation; append and insert keep the
	// rest of the file, which the input does not hold.
	if operation := StringField(toolInput, "command"); operation == "append" || operation == "insert" {
		return nil
	}

	if editsValue, ok := toolInput.get("edits"); ok {
		if edits, isArray := editsValue.([]any); isArray {
			replacements := make([]any, 0, len(edits))

			for _, edit := range edits {
				replacement := replacementInputOf(edit)
				if replacement == nil {
					return nil
				}

				replacements = append(replacements, replacement)
			}

			return &FileEdit{Tool: "MultiEdit", Input: JSObjectOf("edits", replacements)}
		}
	}

	if replacement := replacementInputOf(toolInput); replacement != nil {
		return &FileEdit{Tool: "Edit", Input: replacement}
	}

	for _, key := range []string{"content", "file_text"} {
		if value, ok := toolInput.get(key); ok {
			if content, isString := value.(string); isString {
				return &FileEdit{Tool: "Write", Input: JSObjectOf("content", content)}
			}
		}
	}

	return nil
}

var patchFileLine = regexp.MustCompile(`^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$`) //nolint:gochecknoglobals // compiled once

// patchLineMatches returns the paths of the patch marker lines in text, as
// JavaScript's multiline pattern finds them: ^ and $ at every line
// terminator.
func patchLineMatches(text string) []string {
	var paths []string

	for _, line := range jsLines(text) {
		if match := patchFileLine.FindStringSubmatch(line); match != nil {
			paths = append(paths, match[1])
		}
	}

	return paths
}

func patchTextOf(toolInput HookInput) (string, bool) {
	for _, key := range []string{"patchText", "command", "patch", "input"} {
		text := StringField(toolInput, key)
		if len(patchLineMatches(text)) > 0 {
			return text, true
		}
	}

	return "", false
}

// PatchPaths returns the files a patch adds, updates, deletes or moves to,
// as its marker lines name them (`*** Update File: src/a.ts`).
func PatchPaths(patch string) []string {
	paths := []string{}

	for _, match := range patchLineMatches(patch) {
		path := jsTrim(match)
		if path != "" && !slices.Contains(paths, path) {
			paths = append(paths, path)
		}
	}

	return paths
}

// ToolCallOf maps one tool call, from the tool's own name and input, to the
// checks' terms, whichever agent tool sent it: Claude Code, Codex, Copilot
// CLI, Kiro or the OpenCode plugin (see hook-decisions.ts for each tool's
// documented names).
func ToolCallOf(toolName string, toolInput HookInput) ToolCall {
	if slices.Contains(shellTools(), toolName) {
		return ToolCall{Kind: ToolCallShell, Command: StringField(toolInput, "command"), Changes: nil}
	}

	if !slices.Contains(fileTools(), toolName) {
		return ToolCall{Kind: ToolCallOther, Command: "", Changes: nil}
	}

	if patch, ok := patchTextOf(toolInput); ok {
		changes := []FileChange{}
		for _, path := range PatchPaths(patch) {
			changes = append(changes, FileChange{Path: path, Edit: nil})
		}

		return ToolCall{Kind: ToolCallFile, Command: "", Changes: changes}
	}

	changes := []FileChange{}
	if path := FilePathOf(toolInput); path != "" {
		changes = append(changes, FileChange{Path: path, Edit: fileEditOf(toolName, toolInput)})
	}

	return ToolCall{Kind: ToolCallFile, Command: "", Changes: changes}
}

// HookToolCall is the tool call a tool hook's input describes.
func HookToolCall(input HookInput) ToolCall {
	return ToolCallOf(ToolNameOf(input), ToolInputOf(input))
}

// HookDialect is how the tool that ran the hook reads a PreToolUse answer.
type HookDialect string

const (
	// DialectClaude is JSON with hookSpecificOutput: Claude Code, Codex,
	// Copilot CLI's PascalCase events and the OpenCode plugin.
	DialectClaude HookDialect = "claude"
	// DialectCopilot is Copilot CLI's camelCase events: a top-level
	// permissionDecision.
	DialectCopilot HookDialect = "copilot"
	// DialectKiro reads the exit code and stderr.
	DialectKiro HookDialect = "kiro"
)

// HookDialectOf is the dialect of the tool that sent input.
func HookDialectOf(input HookInput) HookDialect {
	_, hasToolName := input.get("tool_name")
	_, hasCamel := input.get("toolName")

	if !hasToolName && hasCamel {
		return DialectCopilot
	}

	if StringField(input, "hook_event_name") == "preToolUse" {
		return DialectKiro
	}

	return DialectClaude
}

// IsNoskillsCommand reports whether a Bash command is a noskills CLI call
// (the control plane).
func IsNoskillsCommand(command string) bool {
	trimmed := jsTrim(command)

	return strings.Contains(trimmed, "noskills") || strings.Contains(trimmed, " nos ") ||
		strings.HasSuffix(trimmed, " nos") || strings.HasPrefix(trimmed, "nos ")
}

// ProtectedFile is a file that controls the git guards: an agent that could
// change it could turn them off.
type ProtectedFile string

const (
	// ProtectedNone is no protected file.
	ProtectedNone ProtectedFile = ""
	// ProtectedManifest is .eser/manifest.yml, whose noskills section holds
	// allowGit and the command the git wrapper runs.
	ProtectedManifest ProtectedFile = "manifest"
	// ProtectedGitWrapper is the wrapper directory, .eser/.state/bin/.
	ProtectedGitWrapper ProtectedFile = "git-wrapper"
)

const (
	manifestName = "manifest.yml"
	// wrapperTail is the wrapper directory without the leading .eser/, as a
	// command run inside .eser names it.
	wrapperTail = ".state/bin"
)

// ProtectedFileAt is the protected file an absolute path names. Any .eser
// directory counts, and case is ignored because the default macOS and
// Windows file systems ignore it.
func ProtectedFileAt(absolutePath string) ProtectedFile {
	path := jsToLower(strings.ReplaceAll(absolutePath, `\`, "/"))
	wrapperDir := strings.ToLower("/" + WrapperDir)

	if strings.HasSuffix(path, strings.ToLower("/"+manifestFile)) {
		return ProtectedManifest
	}

	if strings.HasSuffix(path, wrapperDir) || strings.Contains(path, wrapperDir+"/") {
		return ProtectedGitWrapper
	}

	return ProtectedNone
}

type textReplacement struct {
	oldString  string
	newString  string
	replaceAll bool
}

func readReplacement(value any) (textReplacement, bool) {
	o, ok := value.(*JSObject)
	if !ok {
		return textReplacement{}, false
	}

	oldValue, _ := o.get("old_string")
	newValue, _ := o.get("new_string")
	oldString, oldOK := oldValue.(string)
	newString, newOK := newValue.(string)

	if !oldOK || !newOK {
		return textReplacement{}, false
	}

	all, _ := o.get("replace_all")

	return textReplacement{oldString: oldString, newString: newString, replaceAll: all == true}, true
}

// applyReplacement applies one replacement to content; exists is false for
// a file that does not exist. ok is false when the result cannot be worked
// out.
func applyReplacement(content string, exists bool, r textReplacement) (string, bool) {
	// An empty old_string creates the file; the tool refuses it on an
	// existing one.
	if r.oldString == "" {
		return r.newString, !exists
	}

	if !exists || !strings.Contains(content, r.oldString) {
		return "", false
	}

	if r.replaceAll {
		return strings.ReplaceAll(content, r.oldString, r.newString), true
	}

	return strings.Replace(content, r.oldString, r.newString, 1), true
}

// ContentAfterEdit is the content a Write, Edit or MultiEdit call leaves in
// a file that now holds current (exists false when there is no file). ok is
// false when that cannot be worked out: another tool, an input of another
// shape, or an edit whose text is not in the file.
func ContentAfterEdit(toolName string, toolInput HookInput, current string, exists bool) (string, bool) {
	switch toolName {
	case "Write":
		value, _ := toolInput.get("content")
		content, ok := value.(string)

		return content, ok
	case "Edit":
		replacement, ok := readReplacement(toolInput)
		if !ok {
			return "", false
		}

		return applyReplacement(current, exists, replacement)
	case "MultiEdit":
		value, _ := toolInput.get("edits")

		edits, ok := value.([]any)
		if !ok || len(edits) == 0 {
			return "", false
		}

		content := current
		for _, edit := range edits {
			replacement, ok := readReplacement(edit)
			if !ok {
				return "", false
			}

			content, ok = applyReplacement(content, exists, replacement)
			if !ok {
				return "", false
			}

			exists = true
		}

		return content, true
	default:
		return "", false
	}
}

// noskillsSectionOf is the noskills section as the TypeScript readManifest
// sees it. parsed is false when the text is not YAML; present is false when
// there is no section.
func noskillsSectionOf(manifestText string) (value any, present, parsed bool) {
	document, err := parseYAMLCore(manifestText)
	if err != nil {
		return nil, false, false
	}

	o, ok := document.(*JSObject)
	if !ok {
		return nil, false, true
	}

	value, present = o.get(manifestSectionKey)

	return value, present, true
}

// ChangesNoskillsSection reports whether the manifest text after gives the
// noskills section another value than before does (beforeExists false when
// the file did not exist), or cannot be parsed. Comments, key order and the
// other sections do not count.
func ChangesNoskillsSection(before string, beforeExists bool, after string) bool {
	afterValue, afterPresent, afterParsed := noskillsSectionOf(after)
	if !afterParsed {
		return true
	}

	var (
		beforeValue   any
		beforePresent bool
	)

	if beforeExists {
		value, present, parsed := noskillsSectionOf(before)
		if parsed {
			beforeValue, beforePresent = value, present
		}
	}

	beforeJSON, beforeDefined := canonicalJSON(beforeValue, beforePresent)
	afterJSON, afterDefined := canonicalJSON(afterValue, afterPresent)

	return beforeDefined != afterDefined || beforeJSON != afterJSON
}

// readOnlyPrograms write no file of their own; redirections of their output
// are checked separately.
func readOnlyPrograms() []string {
	return []string{
		"[", "basename", "cat", "cd", "cmp", "cut", "diff", "dirname", "echo", "egrep", "fgrep", "file",
		"grep", "head", "jq", "less", "ls", "md5", "md5sum", "more", "nl", "printf", "pwd", "readlink",
		"realpath", "rg", "sha1sum", "sha256sum", "shasum", "stat", "tail", "test", "tr", "true", "wc",
	}
}

// inPlacePrograms read unless an in-place flag makes them rewrite input.
func inPlacePrograms() []string {
	return []string{"sed", "yq"}
}

//nolint:gochecknoglobals // compiled once, read-only
var (
	inPlaceShortFlag     = regexp.MustCompile(`^-[a-zA-Z]*i`)
	substitutionPattern  = regexp.MustCompile("\\$\\(|`|<\\(|>\\(")
	commandSubstitution  = regexp.MustCompile("\\$\\(|`")
	nonFileRedirect      = regexp.MustCompile(`\d*>&\d+|&?\d*>>?` + jsSpace + `*/dev/null\b`)
	readOnlyPartSplitter = regexp.MustCompile(`&&|\|\||[;|&\n]`)
	wordAssignment       = regexp.MustCompile(`^\w+=`)
)

func isInPlaceFlag(word string) bool {
	return word == "--in-place" || strings.HasPrefix(word, "--in-place=") || word == "--inplace" ||
		inPlaceShortFlag.MatchString(word)
}

// isReadOnlyShellCommand reports whether every part of a shell command only
// reads files: each program is read-only (git by the git allowlist) and no
// output goes to a file. Substitutions run programs this check does not see,
// so they count as writes.
func isReadOnlyShellCommand(command string) bool {
	if substitutionPattern.MatchString(command) {
		return false
	}

	withoutRedirects := nonFileRedirect.ReplaceAllLiteralString(command, " ")
	if strings.Contains(withoutRedirects, ">") {
		return false
	}

	for _, part := range jsSplit(withoutRedirects, readOnlyPartSplitter) {
		var words []string

		for _, word := range jsSplitWhitespace(jsTrim(part)) {
			if word != "" {
				words = append(words, word)
			}
		}

		progIdx := slices.IndexFunc(words, func(word string) bool { return !wordAssignment.MatchString(word) })
		if progIdx == -1 {
			continue
		}

		program := jsLastPathPart(words[progIdx], "/")
		args := words[progIdx+1:]

		switch {
		case program == "git":
			if !IsGitAllowed(strings.Join(words[progIdx:], " ")) {
				return false
			}
		case slices.Contains(inPlacePrograms(), program):
			if slices.ContainsFunc(args, isInPlaceFlag) {
				return false
			}
		case !slices.Contains(readOnlyPrograms(), program):
			return false
		}
	}

	return true
}

// wrapperAncestorMatch is the TypeScript WRAPPER_ANCESTOR_PATH test: does
// text hold a path that ends at a directory holding the wrapper (.eser,
// .eser/.state, or .state from inside .eser), with an optional trailing / or
// /*, and nothing of a path after it? Go's regexp has no lookahead, so the
// pattern is matched by hand; every word is scanned once.
func wrapperAncestorMatch(text string) bool {
	const (
		prefixSet = " \t\n\v\f\r'\"=:("
		wordStops = "'\"=:(;&|<>"
		afterSet  = "'\";&|)<>"
	)

	isPrefix := func(r rune) bool { return isJSSpace(r) || strings.ContainsRune(prefixSet, r) }
	isWordRune := func(r rune) bool { return !isJSSpace(r) && !strings.ContainsRune(wordStops, r) }
	endsHere := func(rest string) bool {
		if rest == "" {
			return true
		}

		r, _ := utf8.DecodeRuneInString(rest)

		return isJSSpace(r) || strings.ContainsRune(afterSet, r)
	}

	coreMatches := func(rest string) bool {
		for _, core := range []string{".eser/.state", ".eser", ".state"} {
			if !strings.HasPrefix(rest, core) {
				continue
			}

			tail := rest[len(core):]
			for _, slash := range []string{"/", ""} {
				if !strings.HasPrefix(tail, slash) {
					continue
				}

				afterSlash := tail[len(slash):]
				for _, star := range []string{"*", ""} {
					if strings.HasPrefix(afterSlash, star) && endsHere(afterSlash[len(star):]) {
						return true
					}
				}
			}
		}

		return false
	}

	runes := []rune(text)
	offsets := make([]int, len(runes)+1)

	for i, pos := 0, 0; i < len(runes); i++ {
		offsets[i] = pos
		pos += len(string(runes[i]))
		offsets[i+1] = pos
	}

	for start := 0; start <= len(runes); start++ {
		if start > 0 && !isPrefix(runes[start-1]) {
			continue
		}

		// The optional path before the core: word runes ending with /.
		for q := start; q <= len(runes); q++ {
			if (q == start || runes[q-1] == '/') && coreMatches(text[offsets[q]:]) {
				return true
			}

			if q == len(runes) || !isWordRune(runes[q]) {
				break
			}
		}
	}

	return false
}

// BashProtectedFile is the protected file a Bash command may change, or
// ProtectedNone when it names none or only reads it. The text names the
// manifest when it mentions manifest.yml and .eser, and the wrapper when it
// mentions .state/bin or a directory that holds it. Quoted flag values are
// text, not paths, unless they hold a substitution.
func BashProtectedFile(command string) ProtectedFile {
	scanned := command
	if !commandSubstitution.MatchString(command) {
		scanned = StripFlagValues(command)
	}

	text := jsToLower(strings.ReplaceAll(scanned, `\`, "/"))

	named := ProtectedNone

	switch {
	case strings.Contains(text, wrapperTail):
		named = ProtectedGitWrapper
	case strings.Contains(text, manifestName) && strings.Contains(text, eserDir):
		named = ProtectedManifest
	case wrapperAncestorMatch(text):
		named = ProtectedGitWrapper
	}

	if named == ProtectedNone || isReadOnlyShellCommand(scanned) {
		return ProtectedNone
	}

	return named
}

// ProtectedVia is how an agent tried to change a protected file.
type ProtectedVia string

const (
	// ViaEdit is a file tool whose result is known.
	ViaEdit ProtectedVia = "edit"
	// ViaUnknownEdit is a file tool whose result noskills cannot work out.
	ViaUnknownEdit ProtectedVia = "unknown-edit"
	// ViaCommand is a shell command.
	ViaCommand ProtectedVia = "command"
)

// ProtectedFileDenial is the reason the agent reads when a change to a
// protected file is refused.
func ProtectedFileDenial(file ProtectedFile, via ProtectedVia) string {
	if file == ProtectedGitWrapper {
		action := WrapperDir + "/ holds"
		if via == ViaCommand {
			action = "This command may change " + WrapperDir + "/ or a directory that holds it. That directory holds"
		}

		return action + " the git wrapper that noskills writes when a session starts; the agent may not change it. " +
			"Ask the user if git has to work differently."
	}

	var action string

	switch via {
	case ViaEdit:
		action = "This edit changes the noskills section of " + manifestFile
	case ViaUnknownEdit:
		action = "This change to " + manifestFile +
			" does not show what the file holds afterwards, so it may change the noskills section"
	case ViaCommand:
		action = "This command may change " + manifestFile
	}

	return action + ", and that section is not the agent's to change: it holds allowGit and the command the " +
		"git wrapper runs. Ask the user to change it. The file's other sections may be changed with a text " +
		"replacement or a full write that leaves the noskills section as it is."
}

// ExecutorReminder is shown once per iteration, on the first file edit in
// EXECUTING.
const ExecutorReminder = "[noskills] Implementation work goes to the noskills-executor sub-agent. If you are " +
	"the orchestrating agent, delegate this edit instead of making it yourself. If you are that sub-agent, continue."

// PreToolUseContext joins the executor reminder ("" for none) and the
// file-specific rules into the additionalContext of a PreToolUse allow; ""
// when there is nothing to say.
func PreToolUseContext(reminder string, fileRules []string) string {
	var parts []string

	if reminder != "" {
		parts = append(parts, reminder)
	}

	if len(fileRules) > 0 {
		lines := make([]string, len(fileRules))
		for i, rule := range fileRules {
			lines[i] = "- " + rule
		}

		parts = append(parts, "[noskills] Rules for this file:\n"+strings.Join(lines, "\n"))
	}

	return strings.Join(parts, "\n\n")
}

// IsToolConfigPath reports whether a path is under .eser/ or .claude/:
// noskills' own files and the agent tool's settings, which the phase gate
// lets through and the file log leaves out.
func IsToolConfigPath(filePath string) bool {
	return strings.Contains(filePath, ".eser/") || strings.Contains(filePath, ".claude/")
}

// phaseRestriction is how much each phase restricts file edits.
func phaseRestriction(phase string) int {
	switch phase {
	case PhaseDiscovery, PhaseDiscoveryRefinement, PhaseSpecProposal:
		return 10
	case PhaseSpecApproved, PhaseBlocked:
		return 8
	case PhaseExecuting:
		return 2
	default:
		return 0
	}
}

// MostRestrictivePhase is the phase among the sessions' phases ("" for a
// session with none) that restricts file edits most, or IDLE.
func MostRestrictivePhase(phases []string) string {
	mostRestrictive := PhaseIdle
	maxRestriction := 0

	for _, phase := range phases {
		if restriction := phaseRestriction(phase); phase != "" && restriction > maxRestriction {
			maxRestriction = restriction
			mostRestrictive = phase
		}
	}

	return mostRestrictive
}

// GateState is what the phase gate reads from a spec's state or a session.
type GateState struct {
	Phase         string // "" when the state names none
	Spec          string // "" for a session-only state
	CriteriaScope string // execution.criteriaScope; "review-gate" while the review gate runs
}

// GateStateOf reads the phase gate's fields from state JSON whose shape is
// unchecked.
func GateStateOf(state HookInput) GateState {
	scope := ""
	if execution, ok := fieldObject(state, "execution"); ok {
		scope = StringField(execution, "criteriaScope")
	}

	return GateState{Phase: StringField(state, "phase"), Spec: StringField(state, "spec"), CriteriaScope: scope}
}

// FileEditVerdictKind is what the phase gate does with a file edit.
type FileEditVerdictKind int

const (
	// VerdictAllow lets the edit through with nothing to add.
	VerdictAllow FileEditVerdictKind = iota
	// VerdictExecute lets it through in EXECUTING; the hook adds the
	// executor reminder and the file's rules.
	VerdictExecute
	// VerdictDeny refuses it with Reason.
	VerdictDeny
)

// FileEditVerdict is the phase gate's verdict on one file edit.
type FileEditVerdict struct {
	Kind   FileEditVerdictKind
	Reason string
}

// phaseModeDirective is compiler.ts getPhaseModeDirective.
func phaseModeDirective(phase string) (string, bool) {
	directives := map[string]string{
		PhaseIdle:      "No active spec. Plan mode optional.",
		PhaseDiscovery: "Ensure you are in plan mode. Read-only. Analyze, research, ask.",
		PhaseDiscoveryRefinement: "Ensure you are in plan mode. Read-only. Review answers, " +
			"resolve placeholders.",
		PhaseSpecProposal: "Ensure you are in plan mode. Use ultraplan if available. Generate implementation " +
			"map with file dependencies and execution order.",
		PhaseSpecApproved: "Exit plan mode. Prepare for execution.",
		PhaseExecuting:    "Ensure you have exited plan mode. Sub-agents need full write access.",
		PhaseBlocked:      "Enter plan mode. Analyze the blocker. Present options to user.",
		PhaseCompleted:    "Plan mode optional. Review, record learnings.",
	}

	directive, ok := directives[phase]

	return directive, ok
}

func conversationDenial(phase string, specCommand func(string) string) string {
	directive, _ := phaseModeDirective(phase)
	modeDirective := "\n  modeDirective: " + directive
	thinking := "You are in " + phase + ": this is a thinking phase, not an implementation phase. Read and discuss only."

	switch phase {
	case PhaseDiscovery:
		return thinking + " To write code, complete discovery and get the spec approved first. Run `" +
			specCommand("next") + "` to continue." + modeDirective
	case PhaseDiscoveryRefinement:
		return thinking + " To write code, complete discovery and get the spec approved first. Run `" +
			specCommand(`next --answer="approve"`) + "` or revise answers." + modeDirective
	case PhaseSpecProposal:
		return thinking + " To write code, approve the spec first. Run `" + specCommand("approve") + "`" + modeDirective
	case PhaseSpecApproved:
		return "You are in SPEC_APPROVED. Start execution first: `" + specCommand(`next --answer="start"`) + "`"
	default: // BLOCKED
		return "Execution blocked. Resolve with `" + specCommand(`next --answer="resolution"`) + "`" + modeDirective
	}
}

// FileEditVerdictFor is the phase gate's verdict on an edit of filePath.
// Edits under .eser/ and .claude/ pass; IDLE and COMPLETED allow edits;
// EXECUTING allows them outside the review gate; the conversation phases
// refuse them, and so does a state with no phase. commandPrefix starts every
// command a denial names.
func FileEditVerdictFor(filePath string, state GateState, commandPrefix string) FileEditVerdict {
	if IsToolConfigPath(filePath) {
		return FileEditVerdict{Kind: VerdictAllow, Reason: ""}
	}

	command := func(sub string) string { return commandPrefix + " " + sub }
	specCommand := func(sub string) string {
		if state.Spec == "" {
			return command(sub)
		}

		return command("spec " + state.Spec + " " + sub)
	}
	deny := func(reason string) FileEditVerdict { return FileEditVerdict{Kind: VerdictDeny, Reason: reason} }

	switch state.Phase {
	case "":
		return deny("Phase unknown, so the file edit is blocked. Run `" + command("status") + "` to check state.")
	case PhaseIdle, PhaseCompleted:
		return FileEditVerdict{Kind: VerdictAllow, Reason: ""}
	case PhaseExecuting:
		// The review gate is a read-only pass.
		if state.CriteriaScope == "review-gate" {
			return deny("Review gate active: file edits are blocked. Evaluate concern dimensions against the " +
				"existing implementation and submit findings via `" +
				specCommand(`next --answer='{"completed":[...],"remaining":[]}'`) + "`.")
		}

		return FileEditVerdict{Kind: VerdictExecute, Reason: ""}
	case PhaseDiscovery, PhaseDiscoveryRefinement, PhaseSpecProposal, PhaseSpecApproved, PhaseBlocked:
		return deny(conversationDenial(state.Phase, specCommand))
	default:
		return deny("Run `" + specCommand("next") + "` first.")
	}
}

// IsLoggedFileWrite reports whether the PostToolUse file log records an
// edit of filePath.
func IsLoggedFileWrite(filePath string) bool {
	return filePath != "" && !IsToolConfigPath(filePath)
}

// StopRecordsIteration reports whether the Stop hook records an iteration:
// only in EXECUTING, and never for a stop the Stop hook itself caused.
func StopRecordsIteration(input HookInput, phase string) bool {
	active, _ := input.get("stop_hook_active")

	return active != true && phase == PhaseExecuting
}

// SessionStartOutput is the SessionStart hook's stdout object: the compiled
// noskills output as hookSpecificOutput.additionalContext, or a top-level
// additionalContext for Copilot CLI's camelCase sessionStart.
func SessionStartOutput(compiledJSON string, dialect HookDialect) *JSObject {
	additionalContext := "[noskills] The current noskills state and instruction for this project:\n" + compiledJSON

	if dialect == DialectCopilot {
		return JSObjectOf("additionalContext", additionalContext)
	}

	return JSObjectOf("hookSpecificOutput", JSObjectOf(
		"hookEventName", "SessionStart",
		"additionalContext", additionalContext,
	))
}

// RestartNotice is the stderr notice the Stop hook prints once a spec
// reaches maxIterations, or "" below it.
func RestartNotice(iteration, maxIterations float64) string {
	// Written as JavaScript compares: a NaN threshold never reaches.
	if !(iteration >= maxIterations) {
		return ""
	}

	return "noskills: iteration " + jsNumberString(iteration) + " reached threshold (" +
		jsNumberString(maxIterations) + "). Consider starting a fresh conversation.\n"
}

package noskillsserverfx

// ReadOnlyTools are tools with no side effects on filesystem, network, or
// external services. Their permission decisions are journalled asynchronously
// (Append, no fsync) — per the eng-review per-tool durability contract.
var ReadOnlyTools = map[string]bool{
	"Read":     true,
	"Glob":     true,
	"Grep":     true,
	"LS":       true,
	"WebFetch": true,
}

// WriteTools modify state. Their permission decisions must be journalled
// synchronously (AppendSync / fdatasync) before the worker executes the tool,
// so a daemon crash between the user's decision and the tool execution leaves
// the ledger showing "unanswered" rather than "answered but not executed."
var WriteTools = map[string]bool{
	"Edit":         true,
	"Write":        true,
	"MultiEdit":    true,
	"Bash":         true,
	"NotebookEdit": true,
	"Task":         true,
}

// ClassifyTool returns "read" for read-only tools (async ledger journal) and
// "write" for all others, including unknown tools (write is the safer default).
func ClassifyTool(name string) string {
	if ReadOnlyTools[name] {
		return "read"
	}

	return "write"
}

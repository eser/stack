// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import "testing"

// TASK-327: the MCP command words were quoted without escaping, so a prefix
// with a Windows path or a quote wrote invalid TOML. The expected text is the
// TypeScript adapter's (sync/adapters/codex.test.ts).
func TestCodexMcpTomlEscapesTheCommand(t *testing.T) {
	t.Parallel()

	got := codexMcpToml(`C:\tools\noskills.exe --tag "a b"`)
	want := "[mcp_servers.noskills]\ncommand = \"C:\\\\tools\\\\noskills.exe\"\nargs = [\"--tag\", \"\\\"a\", \"b\\\"\", \"mcp-serve\"]\n"

	if got != want {
		t.Errorf("got\n%s\nwant\n%s", got, want)
	}

	if plain := codexMcpToml("npx eser@latest noskills"); plain != "[mcp_servers.noskills]\ncommand = \"npx\"\nargs = [\"eser@latest\", \"noskills\", \"mcp-serve\"]\n" {
		t.Errorf("a plain prefix changed:\n%s", plain)
	}
}

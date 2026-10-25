// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import "slices"

// The Copilot CLI adapter (sync/adapters/copilot-cli.ts): AGENTS.md and
// .github/copilot-instructions.md, the hooks in .github/hooks/noskills.json
// (version 1, camelCase events), the .agent.md agents in .github/agents/ and
// the MCP server in .copilot/mcp.json.

const (
	copilotShellTools = "bash|powershell"
	copilotFileTools  = "create|edit|str_replace_editor|apply_patch"
)

func copilotHookEntry(prefix string, event HookEvent, matcher string, args ...string) *JSObject {
	entry := JSObjectOf("type", "command")
	if matcher != "" {
		entry.set("matcher", matcher)
	}

	entry.set("command", HookCommand(prefix, event, args...))
	entry.set("timeoutSec", float64(HookTimeoutSeconds(event)))

	return entry
}

func copilotCLIHooks(prefix string) *JSObject {
	return JSObjectOf(
		"sessionStart", []any{copilotHookEntry(prefix, HookSessionStart, "", "--tool=copilot-cli")},
		"preToolUse", []any{copilotHookEntry(prefix, HookPreToolUse, copilotShellTools+"|"+copilotFileTools)},
		"postToolUse", []any{
			copilotHookEntry(prefix, HookPostFileWrite, copilotFileTools),
			copilotHookEntry(prefix, HookPostBash, copilotShellTools),
		},
		"agentStop", []any{copilotHookEntry(prefix, HookStop, "")},
	)
}

// copilotCLIHooksFile is mergeHooksFile in copilot-cli.ts: the user's entries
// of each event list stay without noskills' own; keys whose value is not a
// list are dropped (earlier versions wrote named objects there, which made
// Copilot CLI reject the file).
func copilotCLIHooksFile(existing any, prefix string) *JSObject {
	file, ok := existing.(*JSObject)
	if !ok {
		file = NewJSObject()
	}

	existingHooks := file.obj("hooks")
	userHooks := NewJSObject()

	for _, event := range existingHooks.Keys() {
		entries, isList := existingHooks.values[event].([]any)
		if !isList {
			continue
		}

		userEntries := slices.DeleteFunc(slices.Clone(entries), func(entry any) bool {
			o, isObject := entry.(*JSObject)
			if !isObject {
				return false
			}

			for _, key := range []string{"command", "bash", "powershell"} {
				value, _ := o.get(key)
				if IsNoskillsHookCommand(value) {
					return true
				}
			}

			return false
		})

		if len(userEntries) > 0 {
			userHooks.set(event, userEntries)
		}
	}

	merged := file.clone()
	merged.set("version", 1.0)
	merged.set("hooks", MergeHookGroups(userHooks, copilotCLIHooks(prefix)))

	return merged
}

func syncCopilotCLIRules(c *SyncContext) error {
	if err := syncAgentsMd(c); err != nil {
		return err
	}

	return ruleFileSync(copilotRuleFile)(c)
}

func syncCopilotCLIHooks(c *SyncContext) error {
	path := c.path(".github/hooks/noskills.json")
	existing, _ := readJSONFile(path)

	return writeSyncFile(path, jsonStringifyIndent(copilotCLIHooksFile(existing, c.CommandPrefix))+"\n")
}

func syncCopilotCLIAgents(c *SyncContext) error {
	executor := markdownAgent([]string{
		"name: noskills-executor",
		`description: "Executes a single noskills task. Follows spec behavioral rules and reports structured results."`,
		"tools:", "  - read", "  - write", "  - glob", "  - grep", "  - shell",
	}, executorPromptLines(c.CommandPrefix))

	if err := writeSyncFile(c.path(".github/agents/noskills-executor.agent.md"), executor); err != nil {
		return err
	}

	verifier := markdownAgent([]string{
		"name: noskills-verifier",
		`description: "Independently verifies completed task work. Read-only. Never sees the executor's context."`,
		"tools:", "  - read", "  - glob", "  - grep", "  - shell",
	}, verifierPromptLines())

	return writeSyncFile(c.path(".github/agents/noskills-verifier.agent.md"), verifier)
}

// mcpServersConfig reads an MCP config whose servers sit under mcpServers,
// as the Kiro and Copilot CLI adapters do: the parsed file when its
// mcpServers is neither missing nor null, an empty config otherwise.
func mcpServersConfig(path string) *JSObject {
	empty := JSObjectOf("mcpServers", NewJSObject())

	parsed, ok := readJSONFile(path)
	if !ok {
		return empty
	}

	// `parsed.mcpServers` throws for null, which the adapters catch.
	switch v := parsed.(type) {
	case nil:
		return empty
	case *JSObject:
		if v.isNullish("mcpServers") {
			return empty
		}

		return v
	default:
		// An array, a string, a number or a boolean has no mcpServers.
		return empty
	}
}

// withNoskillsServer is `{ ...existing, mcpServers: { ...existing.mcpServers,
// noskills } }`.
func withNoskillsServer(existing *JSObject, key string, server *JSObject) *JSObject {
	servers := jsSpread(existing.getOr(key))
	servers.set("noskills", server)

	merged := existing.clone()
	merged.set(key, servers)

	return merged
}

func syncCopilotCLIMcp(c *SyncContext) error {
	path := c.path(".copilot/mcp.json")
	parts := splitCommandPrefix(c.CommandPrefix)

	server := JSObjectOf(
		"type", "local",
		"command", parts[0],
		"args", anyOf(append(parts[1:len(parts):len(parts)], "mcp-serve")),
		"tools", []any{"*"},
	)

	merged := withNoskillsServer(mcpServersConfig(path), "mcpServers", server)

	return writeSyncFile(path, jsonStringifyIndent(merged)+"\n")
}

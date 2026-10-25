// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"encoding/json"
	"math"
	"os"
	"testing"
	"time"
)

// The parity test for the hook predicates (TASK-257): the answers of the
// TypeScript functions for a corpus of inputs, replayed against the Go port.
// The corpus is every string literal of the TypeScript tests for the guard,
// the hook decisions, the git wrapper and the hook commands, run through
// each string predicate, plus structured cases for the functions that take
// objects. Recording needs node:
//
//	NOSKILLS_PARITY_RECORD=1 go test -run TestRecordHookParity ./pkg/ajan/noskillsfx/

const parityRecording = "testdata/hook_parity.json"

// paritySources are the TypeScript tests the command corpus is mined from.
func paritySources() []string {
	return []string{
		"pkg/@eserstack/agents/guards/git.test.ts",
		"pkg/@eserstack/agents/guards/git-bypass.test.ts",
		"pkg/@eserstack/agents/guards/git-config.test.ts",
		"pkg/@eserstack/noskills/commands/hook-decisions.test.ts",
		"pkg/@eserstack/noskills/commands/git-guard-hook.test.ts",
		"pkg/@eserstack/noskills/commands/git-wrapper.test.ts",
		"pkg/@eserstack/noskills/commands/invoke-hook.test.ts",
		"pkg/@eserstack/noskills/sync/hook-commands.test.ts",
	}
}

// parityCommands are commands the tests do not hold, for the JavaScript
// string and regexp corners the port has to keep.
func parityCommands() []string {
	return []string{
		"git\u2028push", "git\u00a0push origin", "\u3000git push", "git push\r\nls", "gIt PuSh", "GIT commit -m x",
		"echo ok\u2029git push", "ls | sh\r", "cat x |\u00a0bash", "sh <<EOF\ngit push\nEOF", "bash -lc 'git commit -am x'",
		"eval 'git reset --hard'", "$GIT push", "${G} push", "env -i git push", "sudo -u x git push",
		"\"git\" push", "g''it push", "\\git push", "/usr/bin/git push", "./git push", "git.exe push",
		"git -C /tmp commit", "git -c user.name=x commit", "git --git-dir=.git commit", "git --exec-path",
		"git config --global user.name x", "git config user.name", "git config --get user.name", "git config --list",
		"git branch", "git branch -D main", "git tag v1", "git tag -l", "git stash", "git stash list", "git remote add o x",
		"git remote -v", "git reflog expire", "git send-pack x", "git clone https://x", "git -p log", "git --bogus commit",
		"rm -rf .eser", "rm -rf .eser/", "rm -rf .eser/*", "rm -rf ./.eser/.state", "cd .eser && rm -rf .state",
		"mv .eser/.state/bin x", "cat .eser/.state/bin/git", "ls .eser/.state/bin", "sed -i s/a/b/ .eser/manifest.yml",
		"sed s/a/b/ .eser/manifest.yml", "echo x > .eser/manifest.yml", "echo x >/dev/null; cat .eser/manifest.yml",
		"cat .eser/manifest.yml 2>&1", "yq -i .a=1 .eser/manifest.yml", "echo $(cat .eser/manifest.yml)",
		"rm -rf .ESER/.State/Bin", "rm \u0130.eser/.state", "x=1 rm .eser/.state/bin/git", "echo .eser/manifest.yml.bak",
		"noskills next --answer=\"use git push\"", "npx eser@latest noskills next --answer='git commit'",
		"deno run -A jsr:@eserstack/cli noskills", "deno x npm:noskills", "deno run ./local.ts", "A=1 B=2 npx eser",
		"npm exec noskills", "npm x noskills", "pnpm dlx noskills", "yarn dlx noskills", "bunx noskills", "pnpx noskills",
		"noskills invoke-hook pre-tool-use", "x invoke-hook stop --flag", "invoke-hook stopped", "nos next", "a nos b",
		"*** Update File: src/a.ts\n*** Add File: b.ts\r*** Delete File: c.ts\u2028*** Move to: d.ts",
		"*** Update File:  spaced.ts  ", "sh run.sh", "bash -e x.sh", "source x.sh", ". ./x.sh", "sh -c 'git push'",
		"echo 'git push' > x.sh && sh x.sh", "tee x.sh < y && bash x.sh", "sh < x.sh",
		"   ", "", "git", "git status && git push || git log; git diff\ngit commit",
	}
}

// parityCase is one structured call: a function and its arguments as JSON.
type parityCase struct {
	Fn   string          `json:"fn"`
	Args json.RawMessage `json:"args"`
}

func parityCases() []parityCase { //nolint:funlen,maintidx // one table of calls
	c := func(fn, args string) parityCase { return parityCase{Fn: fn, Args: json.RawMessage(args)} }

	return []parityCase{
		c("toolCallOf", `["Bash",{"command":"git push"}]`),
		c("toolCallOf", `["Write",{"file_path":"a.ts","content":"x"}]`),
		c("toolCallOf", `["Edit",{"file_path":"a.ts","old_string":"a","new_string":"b","replace_all":true}]`),
		c("toolCallOf", `["MultiEdit",{"file_path":"a.ts","edits":[{"old_string":"a","new_string":"b"},{"oldString":"c","newString":"d","replaceAll":true}]}]`),
		c("toolCallOf", `["MultiEdit",{"file_path":"a.ts","edits":[{"old_string":"a"}]}]`),
		c("toolCallOf", `["edit",{"filePath":"a.ts","oldString":"a","newString":"b"}]`),
		c("toolCallOf", `["create",{"path":"a.ts","file_text":"x"}]`),
		c("toolCallOf", `["str_replace_editor",{"path":"a.ts","old_str":"a","new_str":"b"}]`),
		c("toolCallOf", `["fs_write",{"path":"a.ts","command":"append","file_text":"x"}]`),
		c("toolCallOf", `["fs_append",{"path":"a.ts","content":"x"}]`),
		c("toolCallOf", `["delete_file",{"path":"a.ts"}]`),
		c("toolCallOf", `["apply_patch",{"command":"*** Begin Patch\n*** Update File: a.ts\n*** Update File: a.ts\n*** Add File: b.ts\n*** End Patch"}]`),
		c("toolCallOf", `["apply_patch",{"patchText":"*** Delete File: c.ts"}]`),
		c("toolCallOf", `["Write",{"content":"x"}]`),
		c("toolCallOf", `["Read",{"file_path":"a.ts"}]`),
		c("toolCallOf", `["powershell",{"command":"git push"}]`),
		c("toolCallOf", `["execute_bash",{}]`),
		c("hookDialectOf", `[{"toolName":"bash"}]`),
		c("hookDialectOf", `[{"tool_name":"Bash","toolName":"bash"}]`),
		c("hookDialectOf", `[{"hook_event_name":"preToolUse","tool_name":"fs_write"}]`),
		c("hookDialectOf", `[{"hook_event_name":"PreToolUse","tool_name":"Bash"}]`),
		c("hookDialectOf", `[{"toolName":null}]`),
		c("toolInputOf", `[{"tool_input":"{\"command\":\"ls\"}"}]`),
		c("toolInputOf", `[{"tool_input":"*** Update File: a"}]`),
		c("toolInputOf", `[{"tool_input":null,"toolArgs":{"path":"x"}}]`),
		c("toolInputOf", `[{"toolArgs":"[1,2]"}]`),
		c("toolNameOf", `[{"tool_name":"","toolName":"bash"}]`),
		c("hookRoot", `[{"cwd":"/p"},"/env","/cwd"]`),
		c("hookRoot", `[{"cwd":""},"","/cwd"]`),
		c("hookRoot", `[{},"/env","/cwd"]`),
		c("contentAfterEdit", `["Write",{"content":"new"},null]`),
		c("contentAfterEdit", `["Edit",{"old_string":"a","new_string":"$&b"},"aaa"]`),
		c("contentAfterEdit", `["Edit",{"old_string":"a","new_string":"b","replace_all":true},"aaa"]`),
		c("contentAfterEdit", `["Edit",{"old_string":"z","new_string":"b"},"aaa"]`),
		c("contentAfterEdit", `["Edit",{"old_string":"","new_string":"b"},null]`),
		c("contentAfterEdit", `["Edit",{"old_string":"","new_string":"b"},"x"]`),
		c("contentAfterEdit", `["MultiEdit",{"edits":[{"old_string":"","new_string":"ab"},{"old_string":"b","new_string":"c"}]},null]`),
		c("contentAfterEdit", `["MultiEdit",{"edits":[]},"x"]`),
		c("contentAfterEdit", `["Read",{},"x"]`),
		c("changesNoskillsSection", `["noskills:\n  allowGit: false\n","noskills:\n  allowGit: true\n"]`),
		c("changesNoskillsSection", `["# c\nnoskills:\n  allowGit: false\n  command: x\n","noskills:\n  command: x\n  allowGit: false\nother: 1\n"]`),
		c("changesNoskillsSection", `[null,"noskills:\n  allowGit: false\n"]`),
		c("changesNoskillsSection", `[null,"other: 1\n"]`),
		c("changesNoskillsSection", `["other: 1\n","other: 2\n"]`),
		c("changesNoskillsSection", `["noskills:\n  a: 1\n","noskills: [unclosed\n"]`),
		c("changesNoskillsSection", `["noskills:\n  a: 1\n","noskills:\n  a: 1\n---\nnoskills:\n  a: 2\n"]`),
		c("changesNoskillsSection", `["noskills:\n  a: 1\n","noskills:\n  a: 1\n  a: 2\n"]`),
		c("changesNoskillsSection", `["noskills:\n  n: 012\n","noskills:\n  n: 12\n"]`),
		c("changesNoskillsSection", `["noskills:\n  n: 0x10\n","noskills:\n  n: 16\n"]`),
		c("changesNoskillsSection", `["noskills:\n  b: yes\n","noskills:\n  b: \"yes\"\n"]`),
		c("changesNoskillsSection", `["noskills:\n  b: true\n","noskills:\n  b: True\n"]`),
		c("changesNoskillsSection", `["noskills:\n  v: ~\n","noskills:\n  v: null\n"]`),
		c("changesNoskillsSection", `["noskills:\n  v: .nan\n","noskills:\n  v: .inf\n"]`),
		c("changesNoskillsSection", `["base: &b\n  allowGit: false\nnoskills: *b\n","base: &b\n  allowGit: false\nnoskills:\n  allowGit: false\n"]`),
		c("changesNoskillsSection", `["noskills:\n  <<: {a: 1}\n","noskills:\n  a: 1\n"]`),
		c("changesNoskillsSection", `["noskills:\n","noskills: null\n"]`),
		c("changesNoskillsSection", `["noskills:\n  list: [b, a]\n","noskills:\n  list: [a, b]\n"]`),
		c("changesNoskillsSection", `["noskills:\n  t: 2026-01-01\n","noskills:\n  t: \"2026-01-01\"\n"]`),
		c("changesNoskillsSection", `["noskills:\n  1: a\n","noskills:\n  \"1\": a\n"]`),
		c("changesNoskillsSection", `["","noskills: {}\n"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":null,"spec":null,"criteriaScope":null},"npx eser@latest noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"IDLE","spec":null,"criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"COMPLETED","spec":"x","criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"EXECUTING","spec":"x","criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"EXECUTING","spec":"x","criteriaScope":"review-gate"},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"DISCOVERY","spec":"x","criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"DISCOVERY_REFINEMENT","spec":null,"criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"SPEC_PROPOSAL","spec":"x","criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"SPEC_APPROVED","spec":"x","criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"BLOCKED","spec":"x","criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `["src/a.ts",{"phase":"UNINITIALIZED","spec":"x","criteriaScope":null},"noskills"]`),
		c("fileEditVerdict", `[".claude/x",{"phase":"DISCOVERY","spec":"x","criteriaScope":null},"noskills"]`),
		c("gateStateOf", `[{"phase":"EXECUTING","spec":"x","execution":{"criteriaScope":"review-gate"}}]`),
		c("gateStateOf", `[{"phase":"","spec":5,"execution":[1]}]`),
		c("mostRestrictivePhase", `[["IDLE",null,"EXECUTING","SPEC_APPROVED"]]`),
		c("mostRestrictivePhase", `[["BLOCKED","SPEC_APPROVED"]]`),
		c("mostRestrictivePhase", `[[]]`),
		c("preToolUseContext", `[null,[]]`),
		c("preToolUseContext", `["R",["a","b"]]`),
		c("preToolUseContext", `[null,["only"]]`),
		c("preToolUseAnswer", `[{"kind":"deny","reason":"no"},"claude"]`),
		c("preToolUseAnswer", `[{"kind":"deny","reason":"no"},"copilot"]`),
		c("preToolUseAnswer", `[{"kind":"deny","reason":"no"},"kiro"]`),
		c("preToolUseAnswer", `[{"kind":"allow-with-context","context":"c"},"claude"]`),
		c("preToolUseAnswer", `[{"kind":"allow-with-context","context":"c"},"copilot"]`),
		c("preToolUseAnswer", `[{"kind":"allow-with-context","context":"c"},"kiro"]`),
		c("preToolUseAnswer", `[{"kind":"none"},"claude"]`),
		c("sessionStartOutput", `[{"phase":"IDLE","a":[1,"\u2028<>&"]},"claude"]`),
		c("sessionStartOutput", `[{"phase":"IDLE"},"copilot"]`),
		c("askedQuestionsOf", `[{"questions":[{"question":"a"},{"header":"x"},"s",{"question":"b"}]}]`),
		c("askedQuestionsOf", `[{"questions":[],"question":"single"}]`),
		c("askedQuestionsOf", `[{}]`),
		c("askTokenStepsAfter", `[{"phase":"DISCOVERY","spec":"s","specDescription":"d","discovery":{"answers":[{"questionId":"status_quo"}],"mode":"full","premisesCompleted":true,"planPath":null}},[],["What does the user do today?","How do you verify this works?"]]`),
		c("askTokenStepsAfter", `[{"phase":"DISCOVERY","spec":"s","specDescription":"d","discovery":{"answers":[],"mode":"full","premisesCompleted":true,"planPath":null}},[{"stepId":"ambition","match":"exact"}],["Totally unrelated words here"]]`),
		c("askTokenStepsAfter", `[{"phase":"DISCOVERY","spec":"s","specDescription":"d","discovery":{"answers":[{"questionId":"status_quo"},{"questionId":"ambition"},{"questionId":"reversibility"},{"questionId":"user_impact"},{"questionId":"verification"},{"questionId":"scope_boundary"}],"mode":"full","planPath":null}},[{"stepId":"x","match":"exact"}],["q"]]`),
		c("askTokenStepsAfter", `[{"phase":"DISCOVERY","spec":"s","specDescription":"d","discovery":{"answers":[],"planPath":null}},[],["Tell me about it"]]`),
		c("askTokenStepsAfter", `[{"phase":"DISCOVERY","spec":"s","specDescription":"d","discovery":{"answers":[],"planPath":null,"userContext":["ctx"]}},[],["Which mode?"]]`),
		c("askTokenStepsAfter", `[{"phase":"DISCOVERY","spec":"s","specDescription":"d","discovery":{"answers":[],"mode":"full","planPath":null}},[],["Premise?"]]`),
		c("askTokenStepsAfter", `[{"phase":"DISCOVERY_REFINEMENT","spec":"s","specDescription":"d","discovery":{"answers":[]}},[],["Approve?"]]`),
		c("askTokenStepsAfter", `[{"phase":"SPEC_PROPOSAL","spec":"s","discovery":{"answers":[]}},[],["Ok?"]]`),
		c("askTokenStepsAfter", `[null,[],["Anything?"]]`),
		c("compareQuestions", `["What does the user do today without this feature?","What does the user do today?"]`),
		c("compareQuestions", `["Describe the 1-star and 10-star versions.","describe 1-star 10-star versions"]`),
		c("compareQuestions", `["",""]`),
		c("compareQuestions", `["İstanbul İzmir","istanbul izmir"]`),
		c("compareQuestions", `["Ünïcödé wörds hère","ünïcödé words here"]`),
		c("compareQuestions", `["日本語の質問です","日本語の質問です"]`),
		c("compareQuestions", `["a ab abc abcd","abc abcd abcde"]`),
		c("compareQuestions", `["𝒜𝒷 xy","𝒜𝒷 xy"]`),
		c("compareQuestions", `["ΣΑΣ ΟΔΟΣ","σας οδος"]`),
		c("restartNotice", `[15,15]`),
		c("restartNotice", `[14,15]`),
		c("restartNotice", `[3.5,2]`),
		c("stopRecordsIteration", `[{"stop_hook_active":true},"EXECUTING"]`),
		c("stopRecordsIteration", `[{"stop_hook_active":"true"},"EXECUTING"]`),
		c("stopRecordsIteration", `[{},"IDLE"]`),
		c("isLoggedFileWrite", `[""]`),
		c("isLoggedFileWrite", `["src/.eser/x"]`),
		c("userHookGroups", `[{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"npx eser@latest noskills invoke-hook pre-tool-use"},{"type":"command","command":"mine"}]},{"hooks":[{"command":"noskills invoke-hook stop"}]},"odd",{"matcher":"x"}],"Stop":"not a list","2":[{"hooks":[{"command":"u"}]}],"1":[]}]`),
		c("userHookGroups", `["nope"]`),
		c("mergeHookGroups", `[{"Stop":[{"u":1}],"B":[]},{"Stop":[{"n":1}],"A":[{"n":2}]}]`),
		c("hookCommand", `["noskills","session-start",["--tool=copilot-cli"]]`),
		c("hookCommand", `["npx eser@latest noskills","pre-tool-use",[]]`),
		c("networkCommandWarning", `["npx eser@latest noskills"]`),
		c("networkCommandWarning", `["noskills"]`),
		c("buildWrapperScript", `[{"realGit":"/usr/bin/git","projectGitDir":"/p/.git","projectRoot":"/p's dir","commandPrefix":"npx eser@latest noskills"}]`),
		c("buildWrapperScript", `[{"realGit":"/g","projectGitDir":"/p/.git","projectRoot":"/p","commandPrefix":"noskills","checkTimeoutSeconds":7}]`),
		c("prependToPath", `["/a:/b::/c:/b","/b"]`),
		c("removeFromPath", `["/a:/b::/c:/b","/b"]`),
		c("shellQuote", `["it's"]`),
		c("envFileExport", `["/p/.eser/.state/bin"]`),
		c("protectedFileDenial", `["manifest","edit"]`),
		c("protectedFileDenial", `["manifest","unknown-edit"]`),
		c("protectedFileDenial", `["manifest","command"]`),
		c("protectedFileDenial", `["git-wrapper","edit"]`),
		c("protectedFileDenial", `["git-wrapper","command"]`),
		c("gitExecDenial", `[["-C","x","push"]]`),
		c("gitExecDenial", `[[]]`),
		c("validStepsOf", `["{\"token\":\"t\",\"spec\":\"s\",\"steps\":[{\"stepId\":\"a\",\"match\":\"modified\",\"askedQuestion\":\"q\"},{\"stepId\":1},{\"stepId\":\"b\",\"match\":\"x\",\"originalQuestion\":5}],\"createdAt\":\"2026-01-01T00:00:00.000Z\"}","s",1767225660000]`),
		c("validStepsOf", `["{\"spec\":null,\"stepId\":\"legacy\",\"match\":\"exact\",\"createdAt\":\"2026-01-01T00:00:00.000Z\"}",null,1767225660000]`),
		c("validStepsOf", `["{\"spec\":\"s\",\"steps\":[],\"createdAt\":\"2026-01-01T00:00:00.000Z\"}","other",1767225660000]`),
		c("validStepsOf", `["{\"spec\":\"s\",\"steps\":[],\"createdAt\":\"2026-01-01T00:00:00.000Z\"}","s",1767229200001]`),
		c("validStepsOf", `["{\"spec\":\"s\",\"steps\":[],\"createdAt\":\"2026-01-01T00:00:00.000Z\"}","s",1767225599000]`),
		c("validStepsOf", `["not json","s",1767225660000]`),
		c("validStepsOf", `["{\"spec\":\"s\",\"steps\":[],\"createdAt\":\"soon\"}","s",1767225660000]`),
		c("writesFile", `["cat a >> run.sh; sh run.sh","run.sh"]`),
		c("writesFile", `["tee -a 'run.sh' < x","run.sh"]`),
		c("writesFile", `["cat run.sh.bak","run.sh"]`),
		c("writesFile", `["echo > a.b.sh","a+b.sh"]`),
	}
}

func readParity(t *testing.T) (commands []*JSObject, cases []*JSObject) {
	t.Helper()

	data, err := os.ReadFile(parityRecording)
	if err != nil {
		t.Fatalf("read %s: %v (record with NOSKILLS_PARITY_RECORD=1)", parityRecording, err)
	}

	parsed, err := parseJSON(string(data))
	if err != nil {
		t.Fatal(err)
	}

	root, _ := parsed.(*JSObject)
	commandValues, _ := root.get("commands")
	caseValues, _ := root.get("cases")

	for _, v := range commandValues.([]any) {
		commands = append(commands, v.(*JSObject))
	}

	for _, v := range caseValues.([]any) {
		cases = append(cases, v.(*JSObject))
	}

	return commands, cases
}

func nullable(s string) any {
	if s == "" {
		return nil
	}

	return s
}

func stringList(items []string) []any {
	return toAnySlice(items)
}

func boolList(items []bool) []any {
	out := make([]any, len(items))
	for i, item := range items {
		out[i] = item
	}

	return out
}

// goCommandAnswers runs every string predicate on one corpus entry, under
// the recorder's keys.
func goCommandAnswers(c string) *JSObject {
	words := jsSplitWhitespace(jsTrim(c))
	targets := ShellScriptTargets(c)

	writes := make([]bool, len(targets))
	for i, target := range targets {
		writes[i] = WritesFile(c, target)
	}

	split := SplitGitArgs(words)

	subIndex := -1.0
	if split.Subcommand != "" {
		subIndex = float64(len(split.GlobalOptions))
	}

	return JSObjectOf(
		"isGitAllowed", IsGitAllowed(c),
		"extractGitInvocations", stringList(ExtractGitInvocations(c)),
		"containsGitWriteBypass", ContainsGitWriteBypass(c),
		"hasGitWrite", HasGitWrite(c),
		"stripFlagValues", StripFlagValues(c),
		"shellScriptTargets", stringList(targets),
		"writesTargets", boolList(writes),
		"feedsShellFromStdin", FeedsShellFromStdin(c),
		"bashProtectedFile", nullable(string(BashProtectedFile(c))),
		"protectedFileAt", nullable(string(ProtectedFileAt(c))),
		"isNoskillsCommand", IsNoskillsCommand(c),
		"isToolConfigPath", IsToolConfigPath(c),
		"patchPaths", stringList(PatchPaths(c)),
		"networkRunnerOf", nullable(NetworkRunnerOf(c)),
		"isNoskillsHookCommand", IsNoskillsHookCommand(c),
		"parseHookInput", ParseHookInput(c),
		"gitArgs", []any{IsGitArgsAllowed(words), IsGitRemoteWrite(words), string(ClassifyGitExec(words)), subIndex},
	)
}

// parityDefault is the usual answer the recorder leaves out of an entry.
func parityDefault(key, c string) any {
	switch key {
	case "isGitAllowed":
		return true
	case "stripFlagValues":
		return c
	case "extractGitInvocations", "shellScriptTargets", "writesTargets", "patchPaths":
		return []any{}
	case "bashProtectedFile", "protectedFileAt", "networkRunnerOf":
		return nil
	case "parseHookInput":
		return NewJSObject()
	default:
		return false
	}
}

func TestHookParityCommands(t *testing.T) {
	t.Parallel()

	commands, _ := readParity(t)
	if len(commands) < 500 {
		t.Fatalf("the corpus holds %d commands; record again", len(commands))
	}

	for _, want := range commands {
		input := StringField(want, "input")
		got := goCommandAnswers(input)

		for _, key := range got.orderedKeys() {
			wantValue, recorded := want.get(key)
			if !recorded {
				wantValue = parityDefault(key, input)
			}

			gotValue, _ := got.get(key)

			if w, g := jsonStringify(wantValue), jsonStringify(gotValue); w != g {
				t.Errorf("%s(%q):\n  ts %s\n  go %s", key, input, w, g)
			}
		}
	}
}

func argString(args []any, i int) string {
	s, _ := args[i].(string)

	return s
}

func argObject(args []any, i int) *JSObject {
	o, _ := args[i].(*JSObject)
	if o == nil {
		return NewJSObject()
	}

	return o
}

func argStrings(args []any, i int) []string {
	return stringItems(args[i])
}

func toolCallObject(call ToolCall) *JSObject {
	switch call.Kind {
	case ToolCallShell:
		return JSObjectOf("kind", "shell", "command", call.Command)
	case ToolCallFile:
		changes := make([]any, len(call.Changes))

		for i, change := range call.Changes {
			var edit any
			if change.Edit != nil {
				edit = JSObjectOf("tool", change.Edit.Tool, "input", change.Edit.Input)
			}

			changes[i] = JSObjectOf("path", change.Path, "edit", edit)
		}

		return JSObjectOf("kind", "file", "changes", changes)
	default:
		return JSObjectOf("kind", "other")
	}
}

func verdictObject(v FileEditVerdict) *JSObject {
	switch v.Kind {
	case VerdictDeny:
		return JSObjectOf("kind", "deny", "reason", v.Reason)
	case VerdictExecute:
		return JSObjectOf("kind", "execute")
	default:
		return JSObjectOf("kind", "allow")
	}
}

func decisionOf(o *JSObject) PreToolUseDecision {
	switch StringField(o, "kind") {
	case "deny":
		return PreToolUseDecision{Kind: PreToolUseDeny, Reason: StringField(o, "reason"), Context: ""}
	case "allow-with-context":
		return PreToolUseDecision{Kind: PreToolUseAllowWithContext, Reason: "", Context: StringField(o, "context")}
	default:
		return PreToolUseDecision{Kind: PreToolUseNone, Reason: "", Context: ""}
	}
}

func optionalString(value any) (string, bool) {
	s, ok := value.(string)

	return s, ok
}

func goCase(t *testing.T, fn string, args []any) (any, bool) { //nolint:cyclop,funlen,gocyclo,maintidx // one dispatch table
	t.Helper()

	switch fn {
	case "toolCallOf":
		return toolCallObject(ToolCallOf(argString(args, 0), argObject(args, 1))), true
	case "hookDialectOf":
		return string(HookDialectOf(argObject(args, 0))), true
	case "toolInputOf":
		return ToolInputOf(argObject(args, 0)), true
	case "toolNameOf":
		return ToolNameOf(argObject(args, 0)), true
	case "hookRoot":
		return HookRoot(argObject(args, 0), argString(args, 1), argString(args, 2)), true
	case "contentAfterEdit":
		current, exists := optionalString(args[2])

		after, ok := ContentAfterEdit(argString(args, 0), argObject(args, 1), current, exists)
		if !ok {
			return nil, true
		}

		return after, true
	case "changesNoskillsSection":
		before, exists := optionalString(args[0])

		return ChangesNoskillsSection(before, exists, argString(args, 1)), true
	case "fileEditVerdict":
		gate := argObject(args, 1)
		state := GateState{
			Phase:         StringField(gate, "phase"),
			Spec:          StringField(gate, "spec"),
			CriteriaScope: StringField(gate, "criteriaScope"),
		}

		return verdictObject(FileEditVerdictFor(argString(args, 0), state, argString(args, 2))), true
	case "gateStateOf":
		gate := GateStateOf(argObject(args, 0))

		return JSObjectOf("phase", nullable(gate.Phase), "spec", nullable(gate.Spec), "criteriaScope", nullable(gate.CriteriaScope)), true
	case "mostRestrictivePhase":
		items, _ := args[0].([]any)
		phases := make([]string, len(items))

		for i, item := range items {
			phases[i], _ = item.(string)
		}

		return MostRestrictivePhase(phases), true
	case "preToolUseContext":
		reminder, _ := optionalString(args[0])

		return nullable(PreToolUseContext(reminder, argStrings(args, 1))), true
	case "preToolUseAnswer":
		stdout, stderr, code := PreToolUseAnswer(decisionOf(argObject(args, 0)), HookDialect(argString(args, 1)))

		return JSObjectOf("stdout", stdout, "stderr", stderr, "exitCode", float64(code)), true
	case "sessionStartOutput":
		return SessionStartOutput(jsonStringify(args[0]), HookDialect(argString(args, 1))), true
	case "askedQuestionsOf":
		return stringList(AskedQuestionsOf(argObject(args, 0))), true
	case "askTokenStepsAfter":
		state, _ := args[0].(*JSObject)
		if state == nil {
			state = NewJSObject()
		}

		prior, _ := args[1].([]any)

		steps := AskTokenStepsAfter(state, prior, argStrings(args, 2))
		if steps == nil {
			return nil, true
		}

		return steps, true
	case "compareQuestions":
		return CompareQuestions(argString(args, 0), argString(args, 1)), true
	case "restartNotice":
		iteration, _ := args[0].(float64)
		maxIterations, _ := args[1].(float64)

		return nullable(RestartNotice(iteration, maxIterations)), true
	case "stopRecordsIteration":
		return StopRecordsIteration(argObject(args, 0), argString(args, 1)), true
	case "isLoggedFileWrite":
		return IsLoggedFileWrite(argString(args, 0)), true
	case "userHookGroups":
		return UserHookGroups(args[0]), true
	case "mergeHookGroups":
		return MergeHookGroups(argObject(args, 0), argObject(args, 1)), true
	case "hookCommand":
		return HookCommand(argString(args, 0), HookEvent(argString(args, 1)), argStrings(args, 2)...), true
	case "networkCommandWarning":
		return nullable(NetworkCommandWarning(argString(args, 0))), true
	case "buildWrapperScript":
		opts := argObject(args, 0)
		timeout, _ := opts.get("checkTimeoutSeconds")
		seconds, _ := timeout.(float64)

		script, err := BuildWrapperScript(&WrapperScriptOptions{
			RealGit:             StringField(opts, "realGit"),
			ProjectGitDir:       StringField(opts, "projectGitDir"),
			ProjectRoot:         StringField(opts, "projectRoot"),
			CommandPrefix:       StringField(opts, "commandPrefix"),
			CheckTimeoutSeconds: int(seconds),
		})
		if err != nil {
			t.Fatalf("buildWrapperScript: %v", err)
		}

		return script, true
	case "prependToPath":
		return PrependToPath(argString(args, 0), argString(args, 1)), true
	case "removeFromPath":
		return RemoveFromPath(argString(args, 0), argString(args, 1)), true
	case "shellQuote":
		return ShellQuote(argString(args, 0)), true
	case "envFileExport":
		return EnvFileExport(argString(args, 0)), true
	case "protectedFileDenial":
		return ProtectedFileDenial(ProtectedFile(argString(args, 0)), ProtectedVia(argString(args, 1))), true
	case "validStepsOf":
		spec, hasSpec := optionalString(args[1])
		nowMs, _ := args[2].(float64)

		steps, ok := ValidAskTokenSteps(argString(args, 0), spec, hasSpec, time.UnixMilli(int64(nowMs)))
		if !ok {
			return nil, true
		}

		return steps, true
	case "writesFile":
		return WritesFile(argString(args, 0), argString(args, 1)), true
	case "gitExecDenial":
		return GitExecDenial(argStrings(args, 0)), true
	default:
		return nil, false
	}
}

func TestHookParityCases(t *testing.T) {
	t.Parallel()

	_, cases := readParity(t)
	if len(cases) != len(parityCases()) {
		t.Fatalf("%d recorded cases, %d defined; record again", len(cases), len(parityCases()))
	}

	for i, want := range cases {
		fn := StringField(want, "fn")
		argsValue, _ := want.get("args")
		args, _ := argsValue.([]any)

		if failed, _ := want.get("error"); failed == true {
			t.Errorf("case %d %s threw in TypeScript; fix the case", i, fn)

			continue
		}

		got, known := goCase(t, fn, args)
		if !known {
			t.Errorf("case %d: no Go call for %s", i, fn)

			continue
		}

		wantResult, _ := want.get("result")
		if w, g := jsonStringify(wantResult), jsonStringify(got); w != g {
			t.Errorf("case %d %s%s:\n  ts %s\n  go %s", i, fn, jsonStringify(args), w, g)
		}
	}
}

// sum adds at run time; constant arithmetic would be exact.
func sum(a, b float64) float64 { return a + b }

// The JavaScript number and string printing the parity rests on.
func TestJSONStringifyMatchesJavaScript(t *testing.T) {
	t.Parallel()

	cases := []struct {
		value any
		want  string
	}{
		{sum(0.1, 0.2), "0.30000000000000004"},
		{1e-6, "0.000001"},
		{1e-7, "1e-7"},
		{1e21, "1e+21"},
		{1.5e-7, "1.5e-7"},
		{123456789012345680000.0, "123456789012345680000"},
		{math.Copysign(0, -1), "0"},
		{math.Inf(1), "null"},
		{"<&>\u2028\u0001\u007f\"\\\t", `"<&>` + "\u2028" + `\u0001` + "\u007f" + `\"\\\t"`},
		{JSObjectOf("b", 1.0, "2", true, "a", nil, "1", []any{}), `{"1":[],"2":true,"b":1,"a":null}`},
	}

	for _, tc := range cases {
		if got := jsonStringify(tc.value); got != tc.want {
			t.Errorf("jsonStringify(%v) = %s, want %s", tc.value, got, tc.want)
		}
	}

	if got := jsonStringifyIndent(JSObjectOf("a", []any{1.0, NewJSObject()}, "b", []any{})); got != "{\n  \"a\": [\n    1,\n    {}\n  ],\n  \"b\": []\n}" {
		t.Errorf("indented: %s", got)
	}
}

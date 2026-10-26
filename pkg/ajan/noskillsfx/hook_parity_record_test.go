// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// parityScript is the recorder: it mines the corpus, runs every
// TypeScript function over it and writes the answers.
const parityScript = `
import * as fs from "node:fs";
import * as url from "node:url";

const [root, inputPath, outPath] = process.argv.slice(2);
const load = (p) => import(url.pathToFileURL(root + "/" + p).href);
const guards = await load("pkg/@eserstack/agents/guards/git.ts");
const hd = await load("pkg/@eserstack/noskills/commands/hook-decisions.ts");
const gw = await load("pkg/@eserstack/noskills/commands/git-wrapper.ts");
const hc = await load("pkg/@eserstack/noskills/sync/hook-commands.ts");
const qs = await load("pkg/@eserstack/noskills/context/question-similarity.ts");
const ih = await load("pkg/@eserstack/noskills/commands/invoke-hook.ts");
const at = await load("pkg/@eserstack/noskills/state/ask-token.ts");

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const literal = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + "`" + `(?:[^` + "`" + `\\$]|\\.)*` + "`" + `/g;
const corpus = new Set(input.commands);
for (const source of input.sources) {
  const text = fs.readFileSync(root + "/" + source, "utf8");
  for (const match of text.matchAll(literal)) {
    try {
      const value = Function('"use strict"; return (' + match[0] + ");")();
      // A literal that spans code between two quotes in a comment is no
      // command; the rest are kept.
      const code = /\n\s*(?:\/\/|\*|const |await |\))/.test(value);
      if (typeof value === "string" && value.length > 0 && value.length <= 400 && !code) corpus.add(value);
    } catch {
      // not a plain literal
    }
  }
}

const orNull = (value) => value === undefined ? null : value;
const fns = {
  toolCallOf: (a, b) => hd.toolCallOf(a, b),
  hookDialectOf: (a) => hd.hookDialectOf(a),
  toolInputOf: (a) => hd.toolInputOf(a),
  toolNameOf: (a) => hd.toolNameOf(a),
  hookRoot: (a, b, c) => hd.hookRoot(a, b, c),
  contentAfterEdit: (a, b, c) => hd.contentAfterEdit(a, b, c),
  changesNoskillsSection: (a, b) => hd.changesNoskillsSection(a, b),
  fileEditVerdict: (a, b, c) => hd.fileEditVerdict(a, b, c),
  gateStateOf: (a) => hd.gateStateOf(a),
  mostRestrictivePhase: (a) => hd.mostRestrictivePhase(a),
  preToolUseContext: (a, b) => hd.preToolUseContext(a, b),
  preToolUseAnswer: (a, b) => ih.preToolUseAnswer(a, b),
  sessionStartOutput: (a, b) => hd.sessionStartOutput(a, b),
  askedQuestionsOf: (a) => hd.askedQuestionsOf(a),
  askTokenStepsAfter: (a, b, c) => hd.askTokenStepsAfter(a, b, c),
  compareQuestions: (a, b) => qs.compareQuestions(a, b),
  restartNotice: (a, b) => hd.restartNotice(a, b),
  stopRecordsIteration: (a, b) => hd.stopRecordsIteration(a, b),
  isLoggedFileWrite: (a) => hd.isLoggedFileWrite(a),
  userHookGroups: (a) => hc.userHookGroups(a),
  mergeHookGroups: (a, b) => hc.mergeHookGroups(a, b),
  hookCommand: (a, b, c) => hc.hookCommand(a, b, c),
  networkCommandWarning: (a) => hc.networkCommandWarning(a),
  buildWrapperScript: (a) => gw.buildWrapperScript(a),
  prependToPath: (a, b) => gw.prependToPath(a, b),
  removeFromPath: (a, b) => gw.removeFromPath(a, b),
  shellQuote: (a) => gw.shellQuote(a),
  envFileExport: (a) => gw.envFileExport(a),
  protectedFileDenial: (a, b) => hd.protectedFileDenial(a, b),
  validStepsOf: (a, b, c) => at.validStepsOf(a, b, c),
  writesFile: (a, b) => guards.writesFile(a, b),
  gitExecDenial: (a) => gw.gitExecDenial(a),
};

// Each entry holds the answers that differ from the usual one
// (parityDefault in the Go test), so the recording stays small.
const usual = (key, c) => ({
  isGitAllowed: true, extractGitInvocations: [], containsGitWriteBypass: false, hasGitWrite: false,
  stripFlagValues: c, shellScriptTargets: [], writesTargets: [], feedsShellFromStdin: false,
  bashProtectedFile: null, protectedFileAt: null, isNoskillsCommand: false, isToolConfigPath: false,
  patchPaths: [], networkRunnerOf: null, isNoskillsHookCommand: false, parseHookInput: {},
})[key];

const commands = [...corpus].sort().map((c) => {
  const words = c.trim().split(/\s+/);
  const split = guards.splitGitArgs(words);
  const answers = {
    isGitAllowed: guards.isGitAllowed(c),
    extractGitInvocations: guards.extractGitInvocations(c),
    containsGitWriteBypass: guards.containsGitWriteBypass(c),
    hasGitWrite: guards.hasGitWrite(c),
    stripFlagValues: guards.stripFlagValues(c),
    shellScriptTargets: guards.shellScriptTargets(c),
    writesTargets: guards.shellScriptTargets(c).map((t) => guards.writesFile(c, t)),
    feedsShellFromStdin: guards.feedsShellFromStdin(c),
    bashProtectedFile: hd.bashProtectedFile(c),
    protectedFileAt: hd.protectedFileAt(c),
    isNoskillsCommand: hd.isNoskillsCommand(c),
    isToolConfigPath: hd.isToolConfigPath(c),
    patchPaths: hd.patchPaths(c),
    networkRunnerOf: hc.networkRunnerOf(c),
    isNoskillsHookCommand: hc.isNoskillsHookCommand(c),
    parseHookInput: hd.parseHookInput(c),
  };
  const entry = { input: c };
  for (const [key, value] of Object.entries(answers)) {
    if (JSON.stringify(value) !== JSON.stringify(usual(key, c))) entry[key] = value;
  }
  // The git argument checks on the command's words: allowed, remote write,
  // the wrapper's kind and where the subcommand stands (-1 for none).
  entry.gitArgs = [
    guards.isGitArgsAllowed(words),
    guards.isGitRemoteWrite(words),
    gw.classifyGitExec(words),
    split.subcommand === "" ? -1 : split.globalOptions.length,
  ];
  return entry;
});

const cases = input.cases.map((k) => {
  try {
    return { fn: k.fn, args: k.args, result: orNull(fns[k.fn](...k.args)) };
  } catch (error) {
    return { fn: k.fn, args: k.args, error: true };
  }
});

// One entry per line keeps the recording diffable and small, spaced as
// oxfmt spaces a JSON object kept on one line.
const inline = (value) => {
  if (Array.isArray(value)) return "[" + value.map(inline).join(", ") + "]";
  if (value !== null && typeof value === "object") {
    const fields = Object.entries(value).map(([k, v]) => JSON.stringify(k) + ": " + inline(v));
    return fields.length === 0 ? "{}" : "{ " + fields.join(", ") + " }";
  }
  return JSON.stringify(value);
};
const lines = (items) => items.map((item) => "    " + inline(item)).join(",\n");
fs.writeFileSync(
  outPath,
  "{\n  \"commands\": [\n" + lines(commands) + "\n  ],\n  \"cases\": [\n" + lines(cases) + "\n  ]\n}\n",
);
`

// TestRecordHookParity records the TypeScript answers when
// NOSKILLS_PARITY_RECORD=1.
func TestRecordHookParity(t *testing.T) {
	if os.Getenv("NOSKILLS_PARITY_RECORD") != "1" {
		t.Skip("set NOSKILLS_PARITY_RECORD=1 to record the TypeScript answers")
	}

	node, err := exec.LookPath("node")
	if err != nil {
		t.Fatal("recording needs node")
	}

	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}

	dir := t.TempDir()
	script := filepath.Join(dir, "record.mjs")
	inputPath := filepath.Join(dir, "input.json")

	input, err := json.Marshal(map[string]any{
		"sources":  paritySources(),
		"commands": parityCommands(),
		"cases":    parityCases(),
	})
	if err != nil {
		t.Fatal(err)
	}

	for path, content := range map[string][]byte{script: []byte(parityScript), inputPath: input} {
		if err := os.WriteFile(path, content, 0o600); err != nil {
			t.Fatal(err)
		}
	}

	out, err := filepath.Abs(parityRecording)
	if err != nil {
		t.Fatal(err)
	}

	recorded := filepath.Join(dir, "hook_parity.json")

	record := exec.Command(node, "--disable-warning=ExperimentalWarning", script, root, inputPath, recorded) //nolint:noctx,gosec // G204: the test's own recorder
	record.Dir = root

	if output, err := record.CombinedOutput(); err != nil {
		t.Fatalf("record: %v\n%s", err, output)
	}

	// The recording is stored as the repository's oxfmt prints it. oxfmt
	// skips testdata/ inside the repository, so it formats the copy in the
	// temporary folder with the repository's configuration.
	oxfmt := filepath.Join(root, "node_modules", ".bin", "oxfmt")
	format := exec.Command(oxfmt, "--config", filepath.Join(root, ".oxfmtrc.json"), recorded) //nolint:noctx,gosec // G204: the formatter on the test's own recording
	format.Dir = dir

	if output, err := format.CombinedOutput(); err != nil {
		t.Fatalf("oxfmt: %v\n%s", err, output)
	}

	formatted, err := os.ReadFile(recorded) //nolint:gosec // G304: the test's own recording
	if err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(out, formatted, 0o600); err != nil { //nolint:gosec // G703: the test's own fixture path
		t.Fatal(err)
	}
}

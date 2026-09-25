# @eserstack/codebase: Agent Guide

Rules for writing and changing the check and fix tools in this package (the
`validate-*` tools and everything run through `deno task cli codebase`). The
repository-wide rules are in the root `AGENTS.md` and `.agents/skills/`.

---

## Multi-Context Tool Design

Scope: `@eserstack/codebase` tools and CLI commands

Rule: A tool is context-agnostic. Its pure logic is a Handler from
`@eserstack/functions`; an Adapter turns CLI, MCP or agent-SDK input into the
Handler's input; a ResponseMapper formats the result for that context. The tool
never assumes where it runs.

```
Handler (pure logic)       Adapter (input)          ResponseMapper (output)
checkFile() -> issues[]    CLI runner               terminal colors + exit code
fixFile() -> mutation      MCP server (IDE tool)    JSON tool result
                           AI agent (SDK tool)      structured for the model
```

---

## Pure Check and Fix Functions

Scope: File-based tools built with `createFileTool()`
(`pkg/@eserstack/codebase/file-tool.ts`)

Rule: Build every file tool with `createFileTool()`. `checkFile` and `checkAll`
receive data and return issues. `fixFile` receives data and returns a mutation
`{ path, oldContent, newContent }`, shaped like an Edit-tool call. Neither reads
from nor writes to disk; the runner decides whether to apply the mutation,
preview it, or hand it to an agent for review.

Correct:

```typescript
export const tool: FileTool = createFileTool({
  name: "validate-eof",
  description: "Ensure files end with a newline",
  canFix: true,
  stacks: [],
  defaults: {},
  checkFile(file, content) {/* return issues */},
  fixFile(file, content) {
    return { path: file.path, oldContent: content, newContent: fixed };
  },
});
```

Incorrect:

```typescript
fixFile(file, content) {
  await runtime.fs.writeTextFile(file.path, fixed); // side effect inside the tool
}
```

**Why:** a tool that only returns data runs unchanged in the CLI, an MCP server
and an agent, supports dry runs, and is tested without a filesystem.

---

## Two-Phase File Loading

Scope: `@eserstack/codebase` file tools

Rule: Tools receive metadata `{ path, name, stat }` first and call
`loadContent(file)` only when they need the text. Tools such as
`validate-large-files` and `validate-case-conflict` never load content.

---

## Walk-Once Pipeline

Scope: The `validate` runner (`pkg/@eserstack/codebase/validation/`)

Rule: When several tools run through `validate`, the runner walks the filesystem
once and passes the file list to every tool. Fixers return mutations; the runner
applies them between tools and writes to disk at the end, which is what makes
dry runs and rollback possible. A new tool plugs into this pipeline; it does not
walk the tree itself.

---

## Adding a Validator

Scope: A new `validate-*` tool

Rule:

1. Create `validate-<name>.ts` with `createFileTool()`, and export `tool`,
   `run`, `validator` and `main` like the existing tools.
2. Register it in `validation/registry.ts` (both the validator list and the
   workflow tool list) and in `module.ts` so `deno task cli codebase <name>`
   finds it.
3. Add it to the `precommit` steps in `.eser/manifest.yml`, with a comment on
   why it exists.
4. Add `validate-<name>.test.ts` that runs the pure check on fixtures and one
   `run({ root })` against a temporary directory.
5. When the rule has existing violations, record them in a baseline under
   `.eser/baselines/` and fail only above it, as `validate-code-conventions`
   does, instead of excluding files.

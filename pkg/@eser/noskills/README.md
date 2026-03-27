# 🍀 [@eser/noskills](./)

State-machine orchestrator for AI coding agents. Instead of loading skills into
context and hoping the agent picks the right one, noskills pushes exactly the
right instruction at the right time — the agent never decides what to do next,
the state machine does.

## Why

AI coding agents have a context rot problem. The more skills, rules, and
conventions you load upfront, the worse the agent performs — its context window
fills with instructions it doesn't need yet, and it forgets the ones it does.

Skills are a "pull" model: the agent decides which skill to load. This creates
two failure modes — picking the wrong skill (wasted context) and needing
meta-knowledge to pick the right one (more context to waste).

noskills is a "push" model:

```
Agent ← stdout (JSON) ← noskills CLI ← filesystem (state + concerns + rules)
```

The agent calls `noskills next`, gets exactly what it needs for the current
phase, acts on it, and calls `noskills next` again. No skill selection, no
context pollution, no forgetting.

## The Mental Model

```
.cursorrules → .cursor/rules/*.mdc → eser/rules + skills → noskills
  (1 file)      (modular, 1 tool)    (portable, curated)   (state-driven)
```

Each generation solved one bottleneck and discovered the next. noskills solves
context rot by making the orchestrator — not the agent — responsible for what
information enters the context window.

The name mirrors the SQL → NoSQL shift: skills define everything upfront,
noskills determines what's needed at runtime.

## How It Works

### The State Machine

Every spec follows a deterministic phase flow:

```
IDLE → DISCOVERY → SPEC_DRAFT → SPEC_APPROVED → EXECUTING ←→ BLOCKED
 ↑                                                   ↓
 └────────────────────── DONE ←──────────────────────┘
```

| Phase             | What happens                                                           |
| ----------------- | ---------------------------------------------------------------------- |
| **IDLE**          | No active spec. Start one with `noskills spec new "..."`               |
| **DISCOVERY**     | 6 blended questions probe product, engineering, and QA simultaneously  |
| **SPEC_DRAFT**    | Spec generated from discovery answers. Human reviews                   |
| **SPEC_APPROVED** | Spec approved, waiting to start. A deliberate "ready but not yet" gate |
| **EXECUTING**     | Agent works through the spec. Reports progress each iteration          |
| **BLOCKED**       | Agent hit a decision it can't make alone. Human resolves               |
| **DONE**          | Spec complete. Summary with iteration count and decisions              |

### The Loop

The entire agent instruction fits in three lines:

```
At every step, run: noskills next
Follow the JSON output.
Submit results with: noskills next --answer="..."
```

The agent never reads skill files, concern files, or rule files directly.
`noskills next` outputs a JSON payload with exactly the right instruction,
context, and transition guidance for the current phase.

### Concerns — The Project's DNA

Concerns define what your project IS. They stack on top of each other and affect
discovery questions, spec sections, and execution reminders:

| Concern               | Effect                                                                |
| --------------------- | --------------------------------------------------------------------- |
| **open-source**       | Prioritize contributor experience, default to permissive choices      |
| **beautiful-product** | Every UI state specified — empty, loading, error, success. No AI slop |
| **long-lived**        | Favor boring technology, every shortcut needs justification           |
| **move-fast**         | Good enough is good enough, defer polish to v2                        |
| **compliance**        | Every state change must be traceable, verification is mandatory       |
| **learning-project**  | Experimentation encouraged, document learnings over polish            |

When concerns conflict (e.g., move-fast + compliance), noskills surfaces the
tension to the human rather than resolving it silently.

### Discovery Questions

Six questions, each probing product + engineering + QA at once:

1. **What does the user do today without this feature?**
2. **Describe the 1-star and 10-star versions.**
3. **Does this change involve an irreversible decision?**
4. **Does this change affect existing users' behavior?**
5. **How do you verify this works correctly?**
6. **What should this feature NOT do?**

Active concerns inject sub-questions. For example, with `open-source` active,
question 1 also asks: _"Is this workaround common in the community?"_

### Tool Sync — One Source of Truth

noskills generates instruction files for every AI tool your team uses:

```
.eser/ (single source of truth)
└── noskills sync
    ├── → CLAUDE.md          (Claude Code)
    ├── → .cursorrules       (Cursor)
    ├── → .kiro/steering/    (Kiro)
    ├── → .github/copilot-instructions.md (GitHub Copilot)
    └── → .windsurfrules     (Windsurf)
```

Write your rules once in `.eser/rules/`, run `noskills sync`, and every tool
gets the same instructions in its native format.

## CLI

```bash
# Via eser CLI
eser noskills init                          # Initialize .eser/ in project
eser noskills concern add open-source       # Activate a concern
eser noskills spec new "photo upload"       # Start a new spec → DISCOVERY
eser noskills next                          # Get current instruction (JSON)
eser noskills next --answer="users drag-drop files today"  # Submit answer
eser noskills approve                       # Approve spec → SPEC_APPROVED
eser noskills next --answer="start"         # Begin execution
eser noskills block "need API key decision" # Block execution
eser noskills next --answer="use OAuth2"    # Resolve block
eser noskills done                          # Mark complete → DONE
eser noskills status                        # Show current phase
eser noskills sync                          # Regenerate tool files
eser noskills rule add "Use Deno"           # Add a permanent rule
eser noskills concern list                  # Show available concerns

# Standalone
deno run --allow-all jsr:@eser/noskills init

# Alias
eser nos init
```

### Commands

| Command                   | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `init`                    | Scaffold `.eser/`, detect project traits and coding tools |
| `status`                  | Show current phase, spec name, progress                   |
| `spec new "..."`          | Start a new spec, enter DISCOVERY                         |
| `spec list`               | List all specs                                            |
| `next`                    | Get JSON instruction for current phase                    |
| `next --answer="..."`     | Submit answer and advance state                           |
| `approve`                 | Approve spec draft → SPEC_APPROVED                        |
| `done`                    | Complete execution → DONE                                 |
| `block "reason"`          | Mark execution as blocked                                 |
| `reset`                   | Reset current spec to IDLE                                |
| `concern add/remove/list` | Manage active concerns                                    |
| `rule add/list/promote`   | Manage permanent rules                                    |
| `sync`                    | Regenerate tool-specific instruction files                |

## Directory Structure

```
.eser/                         # unified toolchain directory (like .github/)
├── manifest.yml               # workflows, scripts, AND noskills config
├── concerns/                  # Concern definitions (built-in + custom)
│   ├── open-source.json
│   ├── beautiful-product.json
│   └── ...
├── rules/                     # Permanent rules (*.md, *.txt)
├── specs/
│   └── photo-upload/
│       └── spec.md            # Generated spec from discovery
├── workflows/                 # (reserved for future use)
├── .state/                    # git-ignored (runtime only)
│   └── state.json             # Current phase, answers, progress
└── .gitignore                 # Excludes .state/
```

noskills config lives inside `manifest.yml` as a `noskills:` section — no
separate config file. The manifest is the single source of truth for the entire
eser toolchain. Writes are comment-preserving (via `yaml@2` Document API).

Configuration and specs are git-tracked for PR review. Runtime state is
gitignored — each agent session reads fresh state from the filesystem.

## Library API

```typescript
import * as noskills from "@eser/noskills/mod";

// State machine
const state = noskills.machine.startSpec(
  noskills.createInitialState(),
  "my-feature",
  "spec/my-feature",
);

// Questions with concern extras
const questions = noskills.questions.getQuestionsWithExtras(activeConcerns);

// Compile instruction for current phase
const output = noskills.compiler.compile(state, activeConcerns, rules);

// Concern tension detection
const tensions = noskills.concerns.detectTensions(activeConcerns);
```

## Agent Bridge

noskills can call AI agents for validation via a fallback chain:

1. **@eser/ai** — Programmatic API call (cross-model, configurable)
2. **Claude CLI** — Spawns `claude -p "..."` locally (zero additional cost)
3. **Manual** — Returns null, caller handles human review

## Init Detection

`noskills init` auto-detects:

- **Languages** — TypeScript, Go, Rust, Python (from config files)
- **Frameworks** — React, Vue, Svelte, Next.js, Express, Hono (from
  package.json)
- **CI** — GitHub Actions, GitLab CI, Jenkins, CircleCI
- **Test runner** — Deno, Vitest, Jest, Playwright
- **Coding tools** — Claude Code, Cursor, Kiro, Copilot, Windsurf (from existing
  config files in repo)

Detected coding tools are auto-synced on init.

## License

Apache-2.0

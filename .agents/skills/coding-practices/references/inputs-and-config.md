# Inputs and Configuration

Where values come from: validated input, configuration sources and paths, in
TypeScript and Go. Validation at trust boundaries (HTTP, CLI, files, LLM output)
is owned by security-practices: Input Validation.

## Contents

- Input Validation
- No Machine-Specific Assumptions
- Configuration Precedence

---

## Input Validation

Scope: Functions that receive data they did not produce

Rule: Validate data where it enters the program, following security-practices:
Input Validation, and turn it into a typed value there. Code past that boundary
trusts the types and does not re-validate. Report a rejected value with an
actionable message (errors.md: Actionable Error Messages), naming the value and
what a valid one looks like.

Correct:

```typescript
export function parseSessionId(input: string): SessionId {
  if (!SESSION_ID_PATTERN.test(input)) {
    throw new ValidationError(
      `session id "${input}" must be 1-64 letters, digits, "-" or "_"`,
      "sessionId",
    );
  }
  return input as SessionId;
}
```

Incorrect:

```typescript
export function loadSession(id: string) {
  return runtime.fs.readTextFile(`${root}/${id}.json`); // "../" reaches any file
}
```

**Why:** one check at the boundary is easy to audit; checks scattered through
the code get skipped on some path.

---

## No Machine-Specific Assumptions

Scope: Source, scripts, tests and config committed to the repo

Rule: No absolute paths, user names, home directories or local ports from one
machine. Read machine settings from environment variables with defaults, and
derive every path from one of two anchors:

- Files that ship with the package (templates, defaults, fixtures) resolve
  relative to the module itself: `import.meta.dirname` in TypeScript, `embed` or
  the package directory in Go.
- Files that belong to the user's project resolve against a root the caller
  passes in (a `projectRoot` or `root` parameter) that defaults to the working
  directory.

Correct:

```typescript
import * as path from "@std/path";
import { runtime } from "@eserstack/standards/cross-runtime";

const templateDir = path.join(import.meta.dirname!, "templates", name);

export async function analyzeComponents(
  srcDir: string,
  options: { projectRoot?: string } = {},
): Promise<Component[]> {
  const root = options.projectRoot ?? runtime.process.cwd();
  // ...
}
```

```go
func LoadManifest(root string) (*Manifest, error) {
    return readManifest(filepath.Join(root, ".eser", "manifest.yml"))
}
```

Incorrect:

```typescript
const root = "/Users/me/projects/app"; // one machine only
const config = path.join(Deno.cwd(), "config.ts"); // hidden global, untestable
```

**Why:** taking the root as a parameter lets a test point the function at a
temporary directory without changing global state, and the code runs on any
machine and in CI.

---

## Configuration Precedence

Scope: Loading configuration in any package or binary

Rule: Resolve each setting in this order, highest first: environment variable,
config file, built-in default. Start from the defaults, apply the file, then
apply the environment. A failure to read or parse a config file that exists is
an error, not a silent fall back to defaults. Settings that decide where
credentials are sent or stored come from the process environment only, never
from a file in the working directory (security-practices: Secrets Come From the
Environment).

Correct:

```go
func LoadConfig(root string) (Config, error) {
    cfg := defaultConfig()

    data, err := os.ReadFile(filepath.Join(root, "config.json"))
    if err != nil && !errors.Is(err, fs.ErrNotExist) {
        return cfg, fmt.Errorf("read config: %w", err)
    }
    if err == nil {
        if err := json.Unmarshal(data, &cfg); err != nil {
            return cfg, fmt.Errorf("parse config.json: %w", err)
        }
    }

    if port := os.Getenv("API_PORT"); port != "" {
        cfg.Port = port // environment wins
    }
    return cfg, nil
}
```

Incorrect:

```go
file, _ := os.Open("config.json")
json.NewDecoder(file).Decode(&cfg) // error ignored, file never closed
```

In Go services, `pkg/ajan/configfx` loads files, env files and the system
environment in this order into structs tagged with `conf:"..."`; use it instead
of hand-written loading.

**Why:** a fixed order lets an operator override any setting without editing
files, and a silently ignored broken file runs the program with settings nobody
chose.

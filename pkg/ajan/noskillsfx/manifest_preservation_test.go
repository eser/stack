package noskillsfx_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/noskillsfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// manifestWithForeignKeys mirrors the shape of this repo's own
// .eser/manifest.yml once noskills is set up: the `noskills:` section sits
// alongside keys owned by entirely different tools.
const manifestWithForeignKeys = `stack:
  - javascript
  - golang

workflows:
  - id: default
    on: [precommit]
    steps:
      - validate-eof

scripts:
  ok: eser workflows run -e precommit

noskills:
  concerns:
    - correctness
  tools:
    - claude-code
  providers: []
  maxIterationsBeforeRestart: 5
  allowGit: true
  command: noskills
`

// TestWriteManifestPreservesForeignKeys pins that writing the manifest does not
// destroy the parts of the file this package does not model.
//
// WriteManifest marshalled NosManifest and wrote it as the ENTIRE file, while
// NosManifest models only the noskills keys. The manifest it overwrites also
// carries `stack:`, `workflows:` and `scripts:` -- and in this very repo the
// `workflows:` block is what `deno task cli ok` executes. So a successful,
// ordinary `concern add` deleted the project's build gate. Reachable from the
// FFI bridge too (bridge.go calls WriteManifest), so it was not limited to the
// Go CLI.
func TestWriteManifestPreservesForeignKeys(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	eserDir := filepath.Join(root, ".eser")
	require.NoError(t, os.MkdirAll(eserDir, 0o750))

	manifestPath := filepath.Join(eserDir, "manifest.yml")
	require.NoError(
		t,
		os.WriteFile(manifestPath, []byte(manifestWithForeignKeys), 0o600),
	)

	manifest, err := noskillsfx.ReadManifest(root)
	require.NoError(t, err)

	// A normal mutation: record one more concern.
	manifest.Concerns = append(manifest.Concerns, "security")

	require.NoError(t, noskillsfx.WriteManifest(root, manifest))

	written, err := os.ReadFile(manifestPath) //nolint:gosec // a path inside the test temp dir
	require.NoError(t, err)

	text := string(written)

	// The managed change landed, inside the section.
	reread, err := noskillsfx.ReadManifest(root)
	require.NoError(t, err)
	assert.Equal(t, []string{"correctness", "security"}, reread.Concerns)
	assert.True(t, reread.AllowGit)
	assert.Equal(t, 5, reread.MaxIterationsBeforeRestart)

	// And nothing else was collateral damage.
	assert.Contains(t, text, "stack:", "stack: block was destroyed")
	assert.Contains(t, text, "workflows:", "workflows: block was destroyed")
	assert.Contains(t, text, "scripts:", "scripts: block was destroyed")
	assert.Contains(t, text, "validate-eof", "workflow steps were destroyed")
}

// TestWriteManifestPreservesComments guards the fix's own failure mode.
//
// Merging through map[string]any would satisfy the test above while silently
// dropping every comment and reordering the document alphabetically. The real
// .eser/manifest.yml is hand-maintained and carries long comments explaining
// why individual steps exist; losing them is a smaller destruction, not the
// absence of one.
func TestWriteManifestPreservesComments(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	eserDir := filepath.Join(root, ".eser")
	require.NoError(t, os.MkdirAll(eserDir, 0o750))

	const annotated = `# Top-of-file rationale that must survive.
stack:
  - golang

# Why this workflow exists.
workflows:
  - id: default
    steps:
      - validate-eof # trailing note

concerns: []
command: noskills
`

	manifestPath := filepath.Join(eserDir, "manifest.yml")
	require.NoError(t, os.WriteFile(manifestPath, []byte(annotated), 0o600))

	manifest, err := noskillsfx.ReadManifest(root)
	require.NoError(t, err)

	manifest.Concerns = append(manifest.Concerns, "correctness")
	require.NoError(t, noskillsfx.WriteManifest(root, manifest))

	written, err := os.ReadFile(manifestPath) //nolint:gosec // a path inside the test temp dir
	require.NoError(t, err)

	text := string(written)

	assert.Contains(t, text, "# Top-of-file rationale that must survive.")
	assert.Contains(t, text, "# Why this workflow exists.")
	assert.Contains(t, text, "# trailing note")
	// Ordering is part of readability too: stack: was first and should stay so.
	assert.Less(
		t,
		strings.Index(text, "stack:"),
		strings.Index(text, "workflows:"),
		"document order was not preserved",
	)
}

// writeManifestFixture writes content as root's .eser/manifest.yml and returns
// the file's path.
func writeManifestFixture(t *testing.T, root string, content string) string {
	t.Helper()

	eserDir := filepath.Join(root, ".eser")
	require.NoError(t, os.MkdirAll(eserDir, 0o750))

	manifestPath := filepath.Join(eserDir, "manifest.yml")
	require.NoError(t, os.WriteFile(manifestPath, []byte(content), 0o600))

	return manifestPath
}

// TestReadManifestReadsTheNoskillsSection pins that Go reads the config where
// the TypeScript CLI writes it. ReadManifest used to read the top level only,
// so every value the TS CLI recorded, the command prefix among them, read as
// empty here.
func TestReadManifestReadsTheNoskillsSection(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name         string
		content      string
		wantCommand  string
		wantConcerns []string
	}{
		{
			"the section the TypeScript CLI writes",
			"stack:\n  - golang\nnoskills:\n  concerns:\n    - correctness\n  command: deno run -A ./tools/nos.ts\n",
			"deno run -A ./tools/nos.ts",
			[]string{"correctness"},
		},
		{
			"top-level keys an earlier version wrote",
			"stack:\n  - golang\nconcerns:\n  - security\ncommand: legacy-noskills\n",
			"legacy-noskills",
			[]string{"security"},
		},
		{
			"the section wins over top-level keys",
			"command: legacy-noskills\nnoskills:\n  command: npx eser@latest noskills\n",
			"npx eser@latest noskills",
			nil,
		},
		{
			"a manifest without noskills config",
			"stack:\n  - golang\nscripts:\n  ok: eser workflows run -e precommit\n",
			"",
			nil,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			writeManifestFixture(t, root, tc.content)

			manifest, err := noskillsfx.ReadManifest(root)
			require.NoError(t, err)
			assert.Equal(t, tc.wantCommand, manifest.Command)
			assert.Equal(t, tc.wantConcerns, manifest.Concerns)
		})
	}
}

func TestReadManifestMissingFile(t *testing.T) {
	t.Parallel()

	_, err := noskillsfx.ReadManifest(t.TempDir())
	require.ErrorIs(t, err, noskillsfx.ErrManifestNotFound)
}

// TestWriteManifestKeepsTheRestOfTheSection pins that WriteManifest merges
// into the section: a key the TS CLI added that NosManifest does not model,
// and the top-level keys an earlier version wrote, stay as they were.
func TestWriteManifestKeepsTheRestOfTheSection(t *testing.T) {
	t.Parallel()

	const content = `command: legacy-noskills
noskills:
  futureKey: keep me
  concerns: []
  command: npx eser@latest noskills
`

	root := t.TempDir()
	manifestPath := writeManifestFixture(t, root, content)

	manifest, err := noskillsfx.ReadManifest(root)
	require.NoError(t, err)

	manifest.Command = "deno run -A ./tools/nos.ts"
	require.NoError(t, noskillsfx.WriteManifest(root, manifest))

	written, err := os.ReadFile(manifestPath) //nolint:gosec // a path inside the test temp dir
	require.NoError(t, err)

	text := string(written)
	assert.Contains(t, text, "futureKey: keep me", "an unmodelled section key was dropped")
	assert.True(
		t,
		strings.HasPrefix(text, "command: legacy-noskills\n"),
		"a top-level key was changed:\n%s",
		text,
	)

	reread, err := noskillsfx.ReadManifest(root)
	require.NoError(t, err)
	assert.Equal(t, "deno run -A ./tools/nos.ts", reread.Command)
}

// TestWriteManifestCreatesTheSection pins that a new manifest gets the
// section, so the TypeScript CLI reads what Go wrote.
func TestWriteManifestCreatesTheSection(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	manifest := noskillsfx.NosManifest{ //nolint:exhaustruct // only the fields the round trip checks
		Concerns: []string{"correctness"},
		Command:  noskillsfx.DefaultCommandPrefix,
	}
	require.NoError(t, noskillsfx.WriteManifest(root, manifest))

	written, err := os.ReadFile(filepath.Join(root, ".eser", "manifest.yml")) //nolint:gosec // a path inside the test temp dir
	require.NoError(t, err)
	assert.True(
		t,
		strings.HasPrefix(string(written), "noskills:\n"),
		"the config is not under a noskills: section:\n%s",
		written,
	)

	reread, err := noskillsfx.ReadManifest(root)
	require.NoError(t, err)
	assert.Equal(t, manifest.Concerns, reread.Concerns)
	assert.Equal(t, manifest.Command, reread.Command)
}

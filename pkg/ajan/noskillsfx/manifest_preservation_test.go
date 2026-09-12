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
// .eser/manifest.yml: the keys noskillsfx models sit alongside keys owned by
// entirely different tools.
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

	written, err := os.ReadFile(manifestPath) //nolint:gosec
	require.NoError(t, err)

	text := string(written)

	// The managed change landed.
	assert.Contains(t, text, "security")

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

	written, err := os.ReadFile(manifestPath) //nolint:gosec
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

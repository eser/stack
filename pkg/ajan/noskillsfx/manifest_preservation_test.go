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
const manifestWithForeignKeys = `# Top-of-file rationale that must survive.
stack:
  - javascript
  - golang

# Why this workflow exists.
workflows:
  - id: default
    on: [precommit]
    steps:
      - validate-eof # trailing note

noskills:
  concerns:
    - correctness
  tools:
    - claude-code
  command: noskills

scripts:
  ok: eser workflows run -e precommit
`

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

func section(concerns ...string) *noskillsfx.JSObject {
	items := make([]any, len(concerns))
	for i, c := range concerns {
		items[i] = c
	}

	return noskillsfx.JSObjectOf(
		"concerns", items,
		"tools", []any{"claude-code"},
		"maxIterationsBeforeRestart", 5.0,
		"allowGit", true,
		"command", "noskills",
	)
}

// TestWriteManifestSectionKeepsTheRestOfTheFile pins that writing the
// noskills section leaves every other byte of the manifest alone: the other
// tools' sections (in this repo `workflows:` is the build gate), their
// comments and their order.
func TestWriteManifestSectionKeepsTheRestOfTheFile(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := writeManifestFixture(t, root, manifestWithForeignKeys)

	require.NoError(t, noskillsfx.WriteManifestSection(root, section("correctness", "security")))

	written, err := os.ReadFile(path) //nolint:gosec // a path inside the test temp dir
	require.NoError(t, err)

	text := string(written)
	before, _, _ := strings.Cut(manifestWithForeignKeys, "noskills:")
	_, after, _ := strings.Cut(manifestWithForeignKeys, "\nscripts:")

	assert.True(t, strings.HasPrefix(text, before), "the text before the section changed:\n%s", text)
	assert.True(t, strings.HasSuffix(text, "\nscripts:"+after), "the text after the section changed:\n%s", text)

	reread := noskillsfx.ReadHookManifest(root)
	assert.Equal(t, []string{"correctness", "security"}, reread.Concerns)
	assert.True(t, reread.AllowGit)
	assert.Equal(t, "noskills", reread.Command)
}

// TestWriteManifestSectionWritesTheTypeScriptForm pins the bytes of a new
// manifest: the ones `noskills init` writes through @eemeli/yaml.
func TestWriteManifestSectionWritesTheTypeScriptForm(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(root, ".eser"), 0o750))

	require.NoError(t, noskillsfx.WriteManifestSection(root, noskillsfx.InitialManifest(&noskillsfx.InitPlan{
		Concerns:  []string{},
		Tools:     []string{"claude-code"},
		Providers: []string{"claude-code"},
		Project: noskillsfx.JSObjectOf("languages", []any{"typescript"}, "frameworks", []any{}, "ci", []any{},
			"testRunner", nil),
		Command: noskillsfx.DefaultCommandPrefix,
	})))

	written, err := os.ReadFile(filepath.Join(root, ".eser", "manifest.yml")) //nolint:gosec // a path inside the test temp dir
	require.NoError(t, err)

	assert.Equal(t, `noskills:
  # noskills orchestrator — inline comments in this section won't be preserved on next write
  concerns: []
  tools:
    - claude-code
  providers:
    - claude-code
  project:
    languages:
      - typescript
    frameworks: []
    ci: []
    testRunner: null
  maxIterationsBeforeRestart: 15
  verifyCommand: null
  allowGit: false
  command: npx eser@latest noskills
`, string(written))
}

// TestWriteManifestSectionAppendsTheSection pins that a manifest without a
// noskills section gets one at the end, after the other tools' keys.
func TestWriteManifestSectionAppendsTheSection(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := writeManifestFixture(t, root, "stack:\n  - golang\n")

	require.NoError(t, noskillsfx.WriteManifestSection(root, section()))

	written, err := os.ReadFile(path) //nolint:gosec // a path inside the test temp dir
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(string(written), "stack:\n  - golang\nnoskills:\n"), "got:\n%s", written)
	assert.True(t, noskillsfx.IsHookInitialized(root))
}

// TestReadHookManifestIgnoresTopLevelKeys pins that, as in the TypeScript
// CLI, only the noskills section counts: keys an earlier Go version wrote at
// the top level do not make the project initialized.
func TestReadHookManifestIgnoresTopLevelKeys(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeManifestFixture(t, root, "stack:\n  - golang\nconcerns:\n  - security\ncommand: legacy-noskills\n")

	assert.False(t, noskillsfx.IsHookInitialized(root))
	assert.False(t, noskillsfx.ReadHookManifest(root).Present)
}

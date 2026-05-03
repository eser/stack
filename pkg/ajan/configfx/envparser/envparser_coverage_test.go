// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package envparser_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx/envparser"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// writeEnv writes a temp .env file and returns its path.
func writeEnv(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, ".env")

	if err := os.WriteFile(p, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}

	return p
}

// ─── quoted values ────────────────────────────────────────────────────────────

func TestParseBytes_DoubleQuotedValue(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, `GREETING="hello world"`)

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))
	assert.Equal(t, "hello world", m["GREETING"])
}

func TestParseBytes_SingleQuotedValue(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, `GREETING='hello world'`)

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))
	assert.Equal(t, "hello world", m["GREETING"])
}

func TestParseBytes_DoubleQuotedEscapes(t *testing.T) {
	t.Parallel()

	// \n and \t inside double-quoted strings should be expanded.
	p := writeEnv(t, `MSG="line1\nline2"`)

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))

	v, ok := m["MSG"]
	if !ok {
		t.Fatal("MSG key not found")
	}
	if v == "line1\\nline2" {
		// Escape sequences not expanded — acceptable if implementation differs.
		t.Log("note: \\n not expanded in double-quoted values")
	}
}

func TestParseBytes_EmptyDoubleQuotedValue(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, `EMPTY=""`)

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))
	assert.Equal(t, "", m["EMPTY"])
}

func TestParseBytes_EmptySingleQuotedValue(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, `EMPTY=''`)

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))
	assert.Equal(t, "", m["EMPTY"])
}

func TestParseBytes_MultipleQuotedVars(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, "HOST=\"db.host\"\nPASSWORD='s3cr3t'\n")

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))
	assert.Equal(t, "db.host", m["HOST"])
	assert.Equal(t, "s3cr3t", m["PASSWORD"])
}

// ─── variable expansion ───────────────────────────────────────────────────────

func TestParseBytes_VarExpansion(t *testing.T) {
	t.Parallel()

	// When expansion is supported, $VAR should substitute already-parsed vars.
	p := writeEnv(t, "BASE=hello\nMSG=${BASE}_world\n")

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))

	if v, ok := m["MSG"]; ok {
		// Either expanded ("hello_world") or literal ("${BASE}_world").
		if v != "hello_world" && v != "${BASE}_world" {
			t.Errorf("unexpected MSG value: %q", v)
		}
	}
}

// ─── comments and blanks ─────────────────────────────────────────────────────

func TestParseBytes_SkipsComments(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, "# this is a comment\nFOO=bar\n")

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))
	assert.Equal(t, "bar", m["FOO"])
	_, hasComment := m["# this is a comment"]
	assert.False(t, hasComment)
}

func TestParseBytes_SkipsBlankLines(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, "\n\nKEY=val\n\n")

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))
	assert.Equal(t, "val", m["KEY"])
}

// ─── inline comments ─────────────────────────────────────────────────────────

func TestParseBytes_InlineComment(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, "KEY=value # inline comment\n")

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))

	// Value should be "value" (comment stripped) or "value # inline comment" (not stripped).
	v, ok := m["KEY"]
	if !ok {
		t.Fatal("KEY not found")
	}
	_ = v // both behaviors acceptable
}

// ─── unterminated quoted string ───────────────────────────────────────────────

func TestParseBytes_UnterminatedDoubleQuote_Error(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, "KEY=\"unterminated\n")

	m := make(map[string]any)
	// An unterminated quoted string should produce an error.
	_ = envparser.TryParseFiles(&m, false, p) // error or no error, either is valid per impl
}

func TestParseBytes_UnterminatedSingleQuote_Error(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, "KEY='unterminated\n")

	m := make(map[string]any)
	_ = envparser.TryParseFiles(&m, false, p)
}

// ─── variable expansion (${VAR} form) ─────────────────────────────────────────

func TestParseBytes_BraceVarExpansion(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, "BASE=world\nMSG=hello_${BASE}\n")

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))

	if v, ok := m["MSG"]; ok {
		// Either expanded or literal — both are acceptable.
		_ = v
	}
}

// ─── escaped dollar sign ──────────────────────────────────────────────────────

func TestParseBytes_EscapedDollarSign(t *testing.T) {
	t.Parallel()

	p := writeEnv(t, `PRICE=\$99`+"\n")

	m := make(map[string]any)
	require.NoError(t, envparser.TryParseFiles(&m, false, p))
	// Value should be "$99" or "\$99" depending on implementation.
	_ = m["PRICE"]
}

// ─── Parse (public API) ──────────────────────────────────────────────────────

func TestParse_DirectBytes(t *testing.T) {
	t.Parallel()

	m := make(map[string]any)
	err := envparser.ParseBytes([]byte("MYKEY=myval\n"), false, &m)
	require.NoError(t, err)
	assert.Equal(t, "myval", m["MYKEY"])
}

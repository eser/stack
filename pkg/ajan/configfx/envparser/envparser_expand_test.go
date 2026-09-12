package envparser_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/configfx/envparser"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestExpandUndefinedVariableDoesNotPanic pins the two ways variable expansion
// used to take the whole process down.
//
// expandVariables looked the name up with a bare map index and asserted the
// result to string. A name that is not defined yields an untyped nil, and the
// assertion panicked on it. This is not a recoverable error path: on the FFI
// bridge the same code runs inside a c-shared library, where a panic unwinds
// through cgo and aborts the host Deno/Node/Bun process.
//
// The case-insensitive variant panicked even when the variable WAS defined,
// because ParseBytes stores keys through lib.CaseInsensitiveSet while the
// lookup used the literal spelling.
func TestExpandUndefinedVariableDoesNotPanic(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name            string
		input           string
		caseInsensitive bool
		key             string
		expected        string
	}{
		{
			name:     "undefined expands to empty",
			input:    "GREETING=hello ${NOT_DEFINED}\n",
			key:      "GREETING",
			expected: "hello ",
		},
		{
			name:     "defined expands",
			input:    "NAME=world\nGREETING=hello ${NAME}\n",
			key:      "GREETING",
			expected: "hello world",
		},
		{
			name:            "defined expands under case-insensitive keys",
			input:           "NAME=world\nGREETING=hello ${NAME}\n",
			caseInsensitive: true,
			key:             "GREETING",
			expected:        "hello world",
		},
		{
			name:            "undefined under case-insensitive keys",
			input:           "GREETING=hello ${NOPE}\n",
			caseInsensitive: true,
			key:             "GREETING",
			expected:        "hello ",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			out := map[string]any{}

			require.NotPanics(t, func() {
				err := envparser.ParseBytes(
					[]byte(testCase.input),
					testCase.caseInsensitive,
					&out,
				)
				require.NoError(t, err)
			})

			var got any
			for k, v := range out {
				if equalFold(k, testCase.key) {
					got = v
				}
			}

			assert.Equal(t, testCase.expected, got)
		})
	}
}

// equalFold avoids depending on which casing the parser chose to store.
func equalFold(a, b string) bool {
	if len(a) != len(b) {
		return false
	}

	for i := range len(a) {
		x, y := a[i], b[i]
		if 'A' <= x && x <= 'Z' {
			x += 'a' - 'A'
		}

		if 'A' <= y && y <= 'Z' {
			y += 'a' - 'A'
		}

		if x != y {
			return false
		}
	}

	return true
}

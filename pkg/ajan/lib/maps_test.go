package lib_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/stretchr/testify/assert"
)

func TestCaseInsensitiveGet(t *testing.T) {
	t.Parallel()

	cases := []struct {
		m         map[string]any
		want      any
		name      string
		key       string
		wantFound bool
	}{
		{
			name:      "exact key",
			m:         map[string]any{"port": "8080"},
			key:       "port",
			want:      "8080",
			wantFound: true,
		},
		{
			name:      "key that differs only in case",
			m:         map[string]any{"DATABASE_URL": "postgres://db"},
			key:       "database_url",
			want:      "postgres://db",
			wantFound: true,
		},
		{
			name:      "exact key wins over a case-insensitive match",
			m:         map[string]any{"Mode": "fold", "mode": "exact"},
			key:       "mode",
			want:      "exact",
			wantFound: true,
		},
		{
			name:      "stored nil value is still found",
			m:         map[string]any{"EMPTY": nil},
			key:       "empty",
			want:      nil,
			wantFound: true,
		},
		{
			name:      "missing key",
			m:         map[string]any{"port": "8080"},
			key:       "host",
			want:      nil,
			wantFound: false,
		},
		{
			name:      "nil map",
			m:         nil,
			key:       "port",
			want:      nil,
			wantFound: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, found := lib.CaseInsensitiveGet(tc.m, tc.key)

			assert.Equal(t, tc.wantFound, found)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestCaseInsensitiveSet(t *testing.T) {
	t.Parallel()

	cases := []struct {
		initial map[string]any
		want    map[string]any
		value   any
		name    string
		key     string
	}{
		{
			name:    "overwrites a key that differs in case and keeps its spelling",
			initial: map[string]any{"DATABASE_URL": "postgres://db1"},
			key:     "database_url",
			value:   "postgres://db2",
			want:    map[string]any{"DATABASE_URL": "postgres://db2"},
		},
		{
			name:    "adds a key that has no match",
			initial: map[string]any{"PORT": "8080"},
			key:     "host",
			value:   "localhost",
			want:    map[string]any{"PORT": "8080", "host": "localhost"},
		},
		{
			name:    "overwrites an exact key",
			initial: map[string]any{"port": "8080"},
			key:     "port",
			value:   "9090",
			want:    map[string]any{"port": "9090"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got := tc.initial

			lib.CaseInsensitiveSet(&got, tc.key, tc.value)

			assert.Equal(t, tc.want, got)
		})
	}
}

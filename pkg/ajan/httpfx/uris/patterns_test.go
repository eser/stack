package uris_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx/uris"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParsePattern(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name         string
		pattern      string
		wantMethod   string
		wantHost     string
		wantPath     string
		wantSegments []struct {
			str   string
			wild  bool
			multi bool
		}
		wantErr bool
	}{
		{ //nolint:exhaustruct
			name:     "simple_path",
			pattern:  "/users",
			wantPath: "/users",
			wantSegments: []struct {
				str   string
				wild  bool
				multi bool
			}{
				{str: "users"}, //nolint:exhaustruct
			},
		},
		{ //nolint:exhaustruct
			name:       "path_with_method",
			pattern:    "GET /users",
			wantMethod: "GET",
			wantPath:   "/users",
			wantSegments: []struct {
				str   string
				wild  bool
				multi bool
			}{
				{str: "users"}, //nolint:exhaustruct
			},
		},
		{ //nolint:exhaustruct
			name:     "path_with_host",
			pattern:  "api.example.com/users",
			wantHost: "api.example.com",
			wantPath: "/users",
			wantSegments: []struct {
				str   string
				wild  bool
				multi bool
			}{
				{str: "users"}, //nolint:exhaustruct
			},
		},
		{ //nolint:exhaustruct
			name:       "path_with_method_and_host",
			pattern:    "GET api.example.com/users",
			wantMethod: "GET",
			wantHost:   "api.example.com",
			wantPath:   "/users",
			wantSegments: []struct {
				str   string
				wild  bool
				multi bool
			}{
				{str: "users"}, //nolint:exhaustruct
			},
		},
		{ //nolint:exhaustruct
			name:     "path_with_wildcard",
			pattern:  "/users/{id}",
			wantPath: "/users/{id}",
			wantSegments: []struct {
				str   string
				wild  bool
				multi bool
			}{
				{str: "users"},          //nolint:exhaustruct
				{str: "id", wild: true}, //nolint:exhaustruct
			},
		},
		{ //nolint:exhaustruct
			name:     "path_with_trailing_slash",
			pattern:  "/users/",
			wantPath: "/users/",
			wantSegments: []struct {
				str   string
				wild  bool
				multi bool
			}{
				{str: "users"},            //nolint:exhaustruct
				{wild: true, multi: true}, //nolint:exhaustruct
			},
		},
		{ //nolint:exhaustruct
			name:     "path_with_multi_wildcard",
			pattern:  "/files/{path...}",
			wantPath: "/files/{path...}",
			wantSegments: []struct {
				str   string
				wild  bool
				multi bool
			}{
				{str: "files"}, //nolint:exhaustruct
				{str: "path", wild: true, multi: true},
			},
		},
		{ //nolint:exhaustruct
			name:     "path_with_trailing_dollar",
			pattern:  "/users/{$}",
			wantPath: "/users/{$}",
			wantSegments: []struct {
				str   string
				wild  bool
				multi bool
			}{
				{str: "users"}, //nolint:exhaustruct
				{str: "/"},     //nolint:exhaustruct
			},
		},
		{ //nolint:exhaustruct
			name:    "empty_pattern",
			pattern: "",
			wantErr: true,
		},
		{ //nolint:exhaustruct
			name:    "invalid_method",
			pattern: "INVALID /users",
			wantErr: true,
		},
		{ //nolint:exhaustruct
			name:    "missing_slash",
			pattern: "users",
			wantErr: true,
		},
		{ //nolint:exhaustruct
			name:    "invalid_wildcard_format",
			pattern: "/users/{id",
			wantErr: true,
		},
		{ //nolint:exhaustruct
			name:    "invalid_wildcard_position",
			pattern: "/users/id}/posts",
			wantErr: true,
		},
		{ //nolint:exhaustruct
			name:    "multi_wildcard_not_at_end",
			pattern: "/files/{path...}/other",
			wantErr: true,
		},
		{ //nolint:exhaustruct
			name:    "dollar_not_at_end",
			pattern: "/users/{$}/posts",
			wantErr: true,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			pattern, err := uris.ParsePattern(tt.pattern)
			if tt.wantErr {
				assert.Error(t, err)

				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.pattern, pattern.String())
			assert.Equal(t, tt.wantMethod, pattern.Method)
			assert.Equal(t, tt.wantHost, pattern.Host)
			assert.Equal(t, tt.wantPath, pattern.Path)

			require.Len(t, pattern.Segments, len(tt.wantSegments))

			for i, want := range tt.wantSegments {
				assert.Equal(t, want.str, pattern.Segments[i].Str)
				assert.Equal(t, want.wild, pattern.Segments[i].Wild)
				assert.Equal(t, want.multi, pattern.Segments[i].Multi)
			}
		})
	}
}

package uris_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx/uris"
	"github.com/stretchr/testify/assert"
)

func TestCleanPath(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "EmptyPath",
			input:    "",
			expected: "/",
		},
		{
			name:     "RootPath",
			input:    "/",
			expected: "/",
		},
		{
			name:     "SingleDotPath",
			input:    "/.",
			expected: "/",
		},
		{
			name:     "DoubleDotPath",
			input:    "/..",
			expected: "/",
		},
		{
			name:     "SingleSegmentPath",
			input:    "/foo",
			expected: "/foo",
		},
		{
			name:     "MultipleSegmentPath",
			input:    "/foo/bar",
			expected: "/foo/bar",
		},
		{
			name:     "PathWithSingleDotSegment",
			input:    "/foo/./bar",
			expected: "/foo/bar",
		},
		{
			name:     "PathWithDoubleDotSegment",
			input:    "/foo/../bar",
			expected: "/bar",
		},
		{
			name:     "PathWithTrailingSlash",
			input:    "/foo/bar/",
			expected: "/foo/bar/",
		},
		{
			name:     "PathWithTrailingSlashAndExtraSlash",
			input:    "foo/bar//",
			expected: "/foo/bar/",
		},
		{
			name:     "PathWithTrailingSlashAndDoubleDotSegment",
			input:    "/foo/bar/..",
			expected: "/foo",
		},
		{
			name:     "PathWithTrailingSlashAndSingleDotSegment",
			input:    "/foo/bar/.",
			expected: "/foo/bar",
		},
		{
			name:     "PathWithoutStartingSlash",
			input:    "foo/bar",
			expected: "/foo/bar",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := uris.CleanPath(tt.input)

			assert.Equal(t, tt.expected, result)
		})
	}
}

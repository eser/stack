package lib_test

import (
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
	"github.com/stretchr/testify/assert"
)

func TestStringsTrimLeadingSpaceFromBytes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		src  []byte
		want []byte
	}{
		{
			name: "Empty input",
			src:  []byte{},
			want: []byte{},
		},
		{
			name: "No leading spaces",
			src:  []byte("Hello, World!"),
			want: []byte("Hello, World!"),
		},
		{
			name: "Leading spaces",
			src:  []byte("   Hello, World!"),
			want: []byte("Hello, World!"),
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := lib.StringsTrimLeadingSpaceFromBytes(tt.src)

			assert.Equal(t, tt.want, got)
		})
	}
}

func TestStringsTrimTrailingSpaceFromBytes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		src  []byte
		want []byte
	}{
		{
			name: "Empty input",
			src:  []byte{},
			want: []byte{},
		},
		{
			name: "No trailing spaces",
			src:  []byte("Hello, World!"),
			want: []byte("Hello, World!"),
		},
		{
			name: "Trailing spaces",
			src:  []byte("Hello, World!   "),
			want: []byte("Hello, World!"),
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := lib.StringsTrimTrailingSpaceFromBytes(tt.src)

			assert.Equal(t, tt.want, got)
		})
	}
}

func TestStringsTrimLeadingSpace(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		src  string
		want string
	}{
		{
			name: "Empty input",
			src:  "",
			want: "",
		},
		{
			name: "No leading spaces",
			src:  "Hello, World!",
			want: "Hello, World!",
		},
		{
			name: "Leading spaces",
			src:  "   Hello, World!",
			want: "Hello, World!",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := lib.StringsTrimLeadingSpace(tt.src)

			assert.Equal(t, tt.want, got)
		})
	}
}

func TestStringsTrimTrailingSpace(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		src  string
		want string
	}{
		{
			name: "Empty input",
			src:  "",
			want: "",
		},
		{
			name: "No trailing spaces",
			src:  "Hello, World!",
			want: "Hello, World!",
		},
		{
			name: "Trailing spaces",
			src:  "Hello, World!   ",
			want: "Hello, World!",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := lib.StringsTrimTrailingSpace(tt.src)

			assert.Equal(t, tt.want, got)
		})
	}
}

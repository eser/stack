package uris_test

import (
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx/uris"
	"github.com/stretchr/testify/assert"
)

func TestIsValidMethod(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		method   string
		expected bool
	}{
		{
			name:     "ValidMethod",
			method:   "GET",
			expected: true,
		},
		{
			name:     "ValidMethodWithLowerCase",
			method:   "post",
			expected: true,
		},
		{
			name:     "InvalidMethodWithSpace",
			method:   "GET ",
			expected: false,
		},
		{
			name:     "InvalidMethodWithSpecialCharacter",
			method:   "GET@",
			expected: false,
		},
		{
			name:     "EmptyMethod",
			method:   "",
			expected: false,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := uris.IsValidMethod(tt.method)

			assert.Equal(
				t,
				tt.expected,
				result,
				"IsValidMethod() = %v, want %v",
				result,
				tt.expected,
			)
		})
	}
}

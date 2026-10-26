package logfx_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
)

func TestColored_ColorReset(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		color    logfx.Color
		expected string
	}{
		{
			name:     "ColorReset",
			color:    logfx.ColorReset,
			expected: "\033[0m",
		},
		{
			name:     "ColorRed",
			color:    logfx.ColorRed,
			expected: "\033[31m",
		},
		{
			name:     "ColorGreen",
			color:    logfx.ColorGreen,
			expected: "\033[32m",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := logfx.Colored(tt.color, "test message")
			expect := string(tt.color) + "test message" + string(logfx.ColorReset)

			assert.Equal(t, expect, result, "Colored() = %v, want %v", result, tt.expected)
		})
	}
}

func BenchmarkColored(b *testing.B) {
	for b.Loop() {
		logfx.Colored(logfx.ColorGreen, "test message")
	}
}

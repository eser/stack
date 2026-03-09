package lib_test

import (
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
	"github.com/stretchr/testify/assert"
)

func TestIDsGenerateUnique(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
	}{
		{
			name: "Test 1",
		},
		{
			name: "Test 2",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := lib.IDsGenerateUnique()

			assert.Len(t, got, 26)
		})
	}
}

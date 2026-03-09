package lib_test

import (
	"crypto/rand"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/lib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// MockReader is a mock implementation of io.Reader that simulates
// a failure in the Read method.
type MockReader struct{}

// Read implements the io.Reader interface for MockReader.
func (m *MockReader) Read(p []byte) (int, error) { //nolint:varnamelen
	// Simulate successful read
	for i := range p {
		p[i] = byte(i)
	}

	return len(p), nil
}

func TestCryptoGetRandomBytes(t *testing.T) { //nolint:paralleltest
	tests := []struct {
		name          string
		mockReader    *MockReader
		expectedError bool
	}{
		{ //nolint:exhaustruct
			name:       "Successful read",
			mockReader: &MockReader{},
		},
	}

	for _, tt := range tests { //nolint:paralleltest
		t.Run(tt.name, func(t *testing.T) {
			originalRand := rand.Reader

			defer func() {
				rand.Reader = originalRand
			}() // Restore original rand.Reader

			const size = 16

			result, err := lib.CryptoGetRandomBytes(size)

			require.NoError(t, err, "CryptoGetRandomBytes() should not return an error")
			assert.Len(t, result, size, "CryptoGetRandomBytes() = %v, want length %v", result, size)
		})
	}
}

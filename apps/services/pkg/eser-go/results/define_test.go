package results_test

import (
	"errors"
	"fmt"
	"log/slog"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/results"
	"github.com/stretchr/testify/assert"
)

var (
	errTest       = errors.New("test")
	errTestNested = fmt.Errorf("testNested: %w", errTest)

	resultOk  = results.Define(results.ResultKindSuccess, "0001", "OK")  //nolint:gochecknoglobals
	resultErr = results.Define(results.ResultKindError, "0002", "Error") //nolint:gochecknoglobals
)

func TestDefine(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name           string
		occurrence     results.Result
		expectedString string
		expectedError  error
	}{
		{
			name:           "resultOk",
			occurrence:     resultOk.New(),
			expectedString: "[0001] OK",
			expectedError:  nil,
		},
		{
			name:           "resultOk with attribute",
			occurrence:     resultOk.New().WithAttribute(slog.String("key", "value")),
			expectedString: "[0001] OK (key=value)",
			expectedError:  nil,
		},
		{
			name:           "resultErr",
			occurrence:     resultErr.Wrap(errTest),
			expectedString: "[0002] Error: test",
			expectedError:  errTest,
		},
		{
			name:           "resultErr with wrapping",
			occurrence:     resultErr.Wrap(errTestNested),
			expectedString: "[0002] Error: testNested: test",
			expectedError:  errTest,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			assert.Equal(t, tt.expectedString, tt.occurrence.String())

			if tt.expectedError != nil {
				assert.ErrorIs(t, tt.occurrence, tt.expectedError)
			}
		})
	}
}

func TestDefineNew(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		occurrence results.Result
		expectedOk bool
	}{
		{
			name:       "resultOk",
			occurrence: resultOk.New(),
			expectedOk: true,
		},
		{
			name:       "resultErr",
			occurrence: resultErr.Wrap(errTest),
			expectedOk: false,
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			if tt.expectedOk {
				assert.False(t, tt.occurrence.IsError())

				return
			}

			assert.True(t, tt.occurrence.IsError())
		})
	}
}

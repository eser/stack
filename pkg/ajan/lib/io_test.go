// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package lib_test

import (
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var errFailingReader = errors.New("disk on fire")

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) { return 0, errFailingReader }

func TestReadAllLimited(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		input    string
		limit    int64
		want     string
		wantErr  error
		wantText string
	}{
		{name: "empty input", input: "", limit: 4, want: ""},
		{name: "under the limit", input: "abc", limit: 4, want: "abc"},
		{name: "exactly the limit", input: "abcd", limit: 4, want: "abcd"},
		{name: "zero limit with empty input", input: "", limit: 0, want: ""},
		{
			name:     "one byte over the limit",
			input:    "abcde",
			limit:    4,
			wantErr:  lib.ErrReadLimitExceeded,
			wantText: "more than 4 bytes",
		},
		{
			name:     "zero limit with input",
			input:    "a",
			limit:    0,
			wantErr:  lib.ErrReadLimitExceeded,
			wantText: "more than 0 bytes",
		},
		{name: "largest limit reads everything", input: "abc", limit: math.MaxInt64, want: "abc"},
		{
			name:     "negative limit",
			input:    "a",
			limit:    -1,
			wantText: "read limit -1 is negative",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			got, err := lib.ReadAllLimited(strings.NewReader(testCase.input), testCase.limit)

			if testCase.wantText == "" {
				require.NoError(t, err)
				assert.Equal(t, testCase.want, string(got))

				return
			}

			require.Error(t, err)
			assert.Nil(t, got)
			assert.Contains(t, err.Error(), testCase.wantText)

			if testCase.wantErr != nil {
				assert.ErrorIs(t, err, testCase.wantErr)
			}
		})
	}
}

func TestReadAllLimited_ReaderError(t *testing.T) {
	t.Parallel()

	got, err := lib.ReadAllLimited(failingReader{}, 16)

	require.ErrorIs(t, err, errFailingReader)
	assert.Nil(t, got)
}

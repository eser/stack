package lib_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/lib"
	"github.com/stretchr/testify/assert"
)

func TestArraysCopy(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		items [][]int
		want  []int
	}{
		{
			name:  "Empty slices",
			items: [][]int{},
			want:  []int{},
		},
		{
			name:  "Single slice",
			items: [][]int{{1, 2, 3}},
			want:  []int{1, 2, 3},
		},
		{
			name:  "Multiple slices",
			items: [][]int{{1, 2}, {3, 4, 5}, {6}},
			want:  []int{1, 2, 3, 4, 5, 6},
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := lib.ArraysCopy(tt.items...)

			assert.ElementsMatch(t, got, tt.want)
		})
	}
}

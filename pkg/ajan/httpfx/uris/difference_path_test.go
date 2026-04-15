package uris_test

import (
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx/uris"
	"github.com/stretchr/testify/assert"
)

func TestDifferencePath(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name string
		p1   *uris.Pattern
		p2   *uris.Pattern
		want string
	}{
		{
			name: "Both patterns have multi segments",
			p1: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Multi: true}, //nolint:exhaustruct
				{Multi: true}, //nolint:exhaustruct
			}},
			p2: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Multi: true}, //nolint:exhaustruct
				{Multi: true}, //nolint:exhaustruct
			}},
			want: "/",
		},
		{
			name: "p1 has multi, p2 doesn't, s2 ends in /",
			p1: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{
					{Multi: true, Str: "foo"}, //nolint:exhaustruct
					{Multi: true},             //nolint:exhaustruct
				},
			},
			p2: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "bar"}, {Str: "/"}}, //nolint:exhaustruct
			},
			want: "/",
		},
		{
			name: "p1 has multi, p2 doesn't, s2 doesn't end in /",
			p1: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Multi: true}, {Multi: true}}, //nolint:exhaustruct
			},
			p2: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "bar"}, {Str: "baz"}}, //nolint:exhaustruct
			},
			want: "/",
		},
		{
			name: "p2 has multi, p1 doesn't",
			p1: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "foo"}, {Str: "bar"}}, //nolint:exhaustruct
			},
			p2: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Multi: true}, {Multi: true}}, //nolint:exhaustruct
			},
			want: "/foo/bar",
		},
		{
			name: "Both patterns have wild segments, same name",
			p1: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Wild: true, Str: "foo"}, //nolint:exhaustruct
				{Wild: true, Str: "bar"}, //nolint:exhaustruct
			}},
			p2: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Wild: true, Str: "foo"}, //nolint:exhaustruct
				{Wild: true, Str: "bar"}, //nolint:exhaustruct
			}},
			want: "/foo/bar",
		},
		{
			name: "p1 has wild, p2 doesn't, different names",
			p1: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Wild: true, Str: "foo"}, //nolint:exhaustruct
				{Wild: true, Str: "bar"}, //nolint:exhaustruct
			}},
			p2: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Str: "baz"}, //nolint:exhaustruct
				{Str: "qux"}, //nolint:exhaustruct
			}},
			want: "/foo/bar",
		},
		{
			name: "p1 has wild, p2 doesn't, same names",
			p1: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Wild: true, Str: "foo"}, //nolint:exhaustruct
				{Wild: true, Str: "bar"}, //nolint:exhaustruct
			}},
			p2: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Str: "foo"}, //nolint:exhaustruct
				{Str: "bar"}, //nolint:exhaustruct
			}},
			want: "/foox/barx",
		},
		{
			name: "p2 has wild, p1 doesn't",
			p1: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Str: "foo"}, //nolint:exhaustruct
				{Str: "bar"}, //nolint:exhaustruct
			}},
			p2: &uris.Pattern{Segments: []uris.Segment{ //nolint:exhaustruct
				{Wild: true, Str: "baz"}, //nolint:exhaustruct
				{Wild: true, Str: "qux"}, //nolint:exhaustruct
			}},
			want: "/foo/bar",
		},
		{
			name: "Both are literals, same",
			p1: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "foo"}, {Str: "bar"}}, //nolint:exhaustruct
			},
			p2: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "foo"}, {Str: "bar"}}, //nolint:exhaustruct
			},
			want: "/foo/bar",
		},
		{
			name: "Both are literals, different (should panic)",
			p1: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "foo"}, {Str: "bar"}}, //nolint:exhaustruct
			},
			p2: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "baz"}, {Str: "qux"}}, //nolint:exhaustruct
			},
			want: "", // This test should panic
		},
		{
			name: "p1 is longer than p2",
			p1: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{
					{Str: "foo"}, //nolint:exhaustruct
					{Str: "bar"}, //nolint:exhaustruct
					{Str: "baz"}, //nolint:exhaustruct
				},
			},
			p2: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "foo"}, {Str: "bar"}}, //nolint:exhaustruct
			},
			want: "/foo/bar/baz",
		},
		{
			name: "p2 is longer than p1",
			p1: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "foo"}, {Str: "bar"}}, //nolint:exhaustruct
			},
			p2: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{
					{Str: "foo"}, //nolint:exhaustruct
					{Str: "bar"}, //nolint:exhaustruct
					{Str: "baz"}, //nolint:exhaustruct
				},
			},
			want: "/foo/bar/baz",
		},
		{
			name: "p1 has multi and it is empty, and p2 is only slash",
			p1:   &uris.Pattern{Segments: []uris.Segment{{Multi: true}}}, //nolint:exhaustruct
			p2:   &uris.Pattern{Segments: []uris.Segment{{Str: "/"}}},    //nolint:exhaustruct
			want: "/x",
		},
		{
			name: "p1 has multi and it is only slah, and p2 is only slash",
			p1: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "/", Multi: true}}, //nolint:exhaustruct
			},
			p2: &uris.Pattern{ //nolint:exhaustruct
				Segments: []uris.Segment{{Str: "/"}}, //nolint:exhaustruct
			},
			want: "//",
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			defer func() {
				r := recover() //nolint:varnamelen

				if tt.want == "" {
					assert.NotNil(t, r, "DifferencePath() did not panic")

					return
				}

				assert.Nil(t, r, "DifferencePath() panicked: %v", r)
			}()

			got := uris.DifferencePath(tt.p1, tt.p2)
			assert.Equal(t, tt.want, got)
		})
	}
}

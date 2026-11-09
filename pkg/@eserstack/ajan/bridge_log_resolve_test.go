// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import "testing"

func TestBridgeLogResolveConfig(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		request string
		want    string
	}{
		{
			name:    "no loggers answer no level, sinks or filters",
			request: `{"category":["app"]}`,
			want:    `{"sinks":[],"filters":[],"levelIndex":-1}`,
		},
		{
			name:    "the most specific level wins and names gather outward",
			request: `{"category":["app","http"],"loggers":[{"category":[],"hasLevel":true,"sinks":["root"],"filters":["rf"]},{"category":["app","http"],"hasLevel":true,"sinks":["h"]},{"category":["app"],"sinks":["a","h"],"filters":["af"]}]}`,
			want:    `{"sinks":["h","a","root"],"filters":["af","rf"],"levelIndex":1}`,
		},
		{
			name:    "override keeps the names of the configs above it out",
			request: `{"category":["app","http"],"loggers":[{"category":["app","http"],"sinks":["h"]},{"category":["app"],"sinks":["a"],"parentSinks":"override"},{"category":[],"sinks":["root"],"filters":["rf"]}]}`,
			want:    `{"sinks":["h","a"],"filters":[],"levelIndex":-1}`,
		},
		{
			name:    "a category that is not segments is refused",
			request: `{"category":"app"}`,
			want:    `{"error":"invalid request JSON: json: cannot unmarshal string into Go struct field logResolveConfigRequest.category of type []string","sinks":null,"filters":null,"levelIndex":-1}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := bridgeLogResolveConfig(tc.request); got != tc.want {
				t.Errorf("got  %s\nwant %s", got, tc.want)
			}
		})
	}
}

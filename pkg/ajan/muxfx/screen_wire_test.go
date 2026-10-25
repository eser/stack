// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package muxfx_test

import (
	"encoding/json"
	"errors"
	"reflect"
	"testing"

	"github.com/eser/stack/pkg/ajan/muxfx"
	"github.com/eser/stack/pkg/ajan/muxfx/vt"
)

func TestScreenRunWireForm(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		run  muxfx.ScreenRun
		want string
	}{
		{"text in the default style", muxfx.ScreenRun{Text: "$ make", Width: 1, Cells: 6}, `["$ make"]`},
		{"styled text", muxfx.ScreenRun{Text: "ok", Style: 3, Width: 1, Cells: 2}, `["ok",3]`},
		{"blank cells", muxfx.ScreenRun{Width: 1, Cells: 5}, `5`},
		{"styled blank cells", muxfx.ScreenRun{Style: 2, Width: 1, Cells: 5}, `["",2,5]`},
		{"wide characters", muxfx.ScreenRun{Text: "漢字", Width: 2, Cells: 4}, `["漢字",0,4,2]`},
		{"a leftover of a wide character", muxfx.ScreenRun{Width: 0, Cells: 1}, `["",0,1,0]`},
		{"a cluster", muxfx.ScreenRun{Text: "e\u0301", Width: 1, Cells: 1, Cluster: true}, "[\"e\u0301\",0,1,1,1]"},
		{"a wide cluster", muxfx.ScreenRun{Text: "👍🏽", Width: 2, Cells: 2, Cluster: true}, `["👍🏽",0,2,2,1]`},
		{"a wide character cut at the edge", muxfx.ScreenRun{Text: "漢", Width: 2, Cells: 1, Cluster: true}, `["漢",0,1,2,1]`},
		{"a link", muxfx.ScreenRun{Text: "docs", Width: 1, Cells: 4, Link: 7}, `["docs",0,4,1,0,7]`},
		{"text that needs escaping", muxfx.ScreenRun{Text: "a\"b\\c\x01\n<&>\u2028", Width: 1, Cells: 11}, `["a\"b\\c\u0001\n<&>\u2028"]`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			out, err := tt.run.MarshalJSON()
			if err != nil || string(out) != tt.want || !json.Valid(out) {
				t.Fatalf("marshal = %s (%v), want %s", out, err, tt.want)
			}

			// json.Marshal compacts what MarshalJSON returns and escapes <,
			// > and &, which reads back the same.
			viaJSON, err := json.Marshal(tt.run)
			if err != nil {
				t.Fatalf("json.Marshal: %v", err)
			}

			for _, encoded := range [][]byte{out, viaJSON} {
				var back muxfx.ScreenRun
				if err := json.Unmarshal(encoded, &back); err != nil || back != tt.run {
					t.Errorf("unmarshal %s = %+v (%v), want %+v", encoded, back, err, tt.run)
				}
			}
		})
	}
}

func TestScreenRunWireFormReplacesInvalidUTF8(t *testing.T) {
	t.Parallel()

	out, err := muxfx.ScreenRun{Text: "a\xffb", Width: 1, Cells: 3}.MarshalJSON()
	if err != nil || string(out) != `["a\ufffdb"]` || !json.Valid(out) {
		t.Errorf("marshal = %s (%v)", out, err)
	}
}

func TestScreenWireFormRejectsMalformedInput(t *testing.T) {
	t.Parallel()

	runs := []string{
		`{"text":"x","width":1,"cells":1}`,
		`[]`,
		`[1]`,
		`["x","1"]`,
		`["x",-1]`,
		`["x",0,-2]`,
		`["x",0,1,3]`,
		`["x",0,1,1,2]`,
		`["x",0,1,1,0,-1]`,
		`["x",0,1,1,0,4294967296]`,
		`["x",0,1,1,0,0,0]`,
		`["x",0.5]`,
		`-1`,
		`1073741825`,
		`2.5`,
		`null`,
		`"x"`,
		`true`,
	}

	for _, raw := range runs {
		var run muxfx.ScreenRun
		if err := json.Unmarshal([]byte(raw), &run); !errors.Is(err, muxfx.ErrScreenRunMalformed) {
			t.Errorf("run %s: err = %v, want ErrScreenRunMalformed", raw, err)
		}
	}

	lines := []string{`{"row":0,"runs":[]}`, `[0]`, `[0,[],1,1]`, `["0",[]]`, `[0,{}]`, `[0,[],2]`, `[0,[],true]`}

	for _, raw := range lines {
		var line muxfx.ScreenLine
		if err := json.Unmarshal([]byte(raw), &line); !errors.Is(err, muxfx.ErrScreenLineMalformed) {
			t.Errorf("line %s: err = %v, want ErrScreenLineMalformed", raw, err)
		}
	}

	var line muxfx.ScreenLine
	if err := json.Unmarshal([]byte(`[0,[[1]]]`), &line); !errors.Is(err, muxfx.ErrScreenRunMalformed) {
		t.Errorf("line with a bad run: err = %v, want ErrScreenRunMalformed", err)
	}

	for _, raw := range []string{`[]`, `[[],1,1]`, `[[],2]`, `[{}]`} {
		var history muxfx.ScreenHistoryLine
		if err := json.Unmarshal([]byte(raw), &history); !errors.Is(err, muxfx.ErrScreenLineMalformed) {
			t.Errorf("history line %s: err = %v, want ErrScreenLineMalformed", raw, err)
		}
	}
}

func TestScreenUpdateWireForm(t *testing.T) {
	t.Parallel()

	blink := true
	update := muxfx.ScreenUpdate{
		Full: true, Cols: 30, Rows: 3,
		Cursor: muxfx.ScreenCursor{X: 2, Y: 2, Visible: true, Shape: "bar", Blink: &blink},
		Title:  "make \"all\"", Mouse: "any", AltScreen: true,
		Styles: []muxfx.ScreenStyle{{}, {
			Fg: vt.Color{Mode: vt.ColorRGB, Value: 0x102030}, Bg: vt.Color{Mode: vt.ColorPalette256, Value: 200},
			UnderlineColor: vt.Color{Mode: vt.ColorPalette16, Value: 1}, Flags: vt.FlagItalic | vt.FlagUnderline,
			Underline: vt.UnderlineStyle(3),
		}},
		Links: []muxfx.ScreenLink{{Link: 4, ID: "a", URI: "https://example.com/?a=1&b=2"}},
		Lines: []muxfx.ScreenLine{
			{Row: 0, Runs: []muxfx.ScreenRun{{Text: "top", Style: 1, Width: 1, Cells: 3}, {Width: 1, Cells: 2}}},
			{Row: 1, Runs: []muxfx.ScreenRun{}, Wrapped: true},
		},
		History: &muxfx.ScreenHistory{Reset: true, Lines: []muxfx.ScreenHistoryLine{
			{Runs: []muxfx.ScreenRun{{Text: "old", Width: 1, Cells: 3}}},
			{Runs: []muxfx.ScreenRun{{Text: "er", Width: 1, Cells: 2}}, Wrapped: true},
		}},
	}

	want := `{"full":true,"cols":30,"rows":3,"cursor":{"x":2,"y":2,"visible":true,"shape":"bar","blink":true},` +
		`"title":"make \"all\"","mouse":"any","altScreen":true,` +
		`"styles":[{},{"fg":{"mode":3,"value":1056816},"bg":{"mode":2,"value":200},"underlineColor":{"mode":1,"value":1},"flags":12,"underline":3}],` +
		`"links":[{"link":4,"id":"a","uri":"https://example.com/?a=1&b=2"}],` +
		`"lines":[[0,[["top",1],2]],[1,[],1]],` +
		`"history":{"reset":true,"lines":[[[["old"]]],[[["er"]],1]]}}`

	out, err := update.MarshalJSON()
	if err != nil || string(out) != want {
		t.Fatalf("marshal =\n%s (%v)\nwant\n%s", out, err, want)
	}

	// json.Marshal finds MarshalJSON on a value and on a pointer; it
	// escapes the & of the URI, which reads back the same.
	for _, v := range []any{update, &update} {
		encoded, err := json.Marshal(v)
		if err != nil {
			t.Fatalf("json.Marshal: %v", err)
		}

		var back muxfx.ScreenUpdate
		if err := json.Unmarshal(encoded, &back); err != nil || !reflect.DeepEqual(back, update) {
			t.Errorf("unmarshal %s = %+v (%v), want %+v", encoded, back, err, update)
		}
	}

	// The style table and the cursor read back with the field names the
	// struct tags give, as encoding/json writes them.
	var plain struct {
		Styles []muxfx.ScreenStyle `json:"styles"`
		Cursor muxfx.ScreenCursor  `json:"cursor"`
		Links  []muxfx.ScreenLink  `json:"links"`
	}

	if err := json.Unmarshal([]byte(want), &plain); err != nil ||
		!reflect.DeepEqual(plain.Styles, update.Styles) || !reflect.DeepEqual(plain.Cursor, update.Cursor) || !reflect.DeepEqual(plain.Links, update.Links) {
		t.Errorf("styles, cursor, links = %+v (%v)", plain, err)
	}
}

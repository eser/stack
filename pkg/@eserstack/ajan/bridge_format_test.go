// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import "testing"

func TestBridgeFormatReadCSV(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		request string
		want    string
	}{
		{
			name:    "the first record gives the headers and an open record stays in the state",
			request: `{"chunk":"b,a,b\n1,\"x\n","final":false,"state":{"rest":"","headers":null,"records":0}}`,
			want:    `{"state":{"rest":"1,\"x\n","headers":["b","a","b"],"records":1},"items":[]}`,
		},
		{
			name:    "the final chunk reads the record left open, keyed in header order",
			request: `{"chunk":"y\",2\r\n","final":true,"delimiter":",","state":{"rest":"1,\"x\n","headers":["b","a","b"],"records":1}}`,
			want:    `{"state":{"rest":"","headers":["b","a","b"],"records":2},"items":[{"b":"2","a":"x\ny"}]}`,
		},
		{
			name:    "given empty headers stay empty and refuse every record",
			request: `{"chunk":"a\n","final":true,"state":{"headers":[]}}`,
			want:    `{"error":"The record has 1 fields, but the header has 0 fields","items":null}`,
		},
		{
			name:    "a delimiter left out is a comma",
			request: `{"chunk":"a;b,c\n1;2,3\n","final":true,"state":{}}`,
			want:    `{"state":{"rest":"","headers":["a;b","c"],"records":2},"items":[{"a;b":"1;2","c":"3"}]}`,
		},
		{
			name:    "an empty delimiter is refused",
			request: `{"chunk":"a\n","final":false,"delimiter":"","state":{}}`,
			want:    `{"error":"CSV delimiter \"\" must be non-empty and hold no quote, CR or LF","items":null}`,
		},
		{
			name:    "broken quoting names its record",
			request: `{"chunk":"a\"b\n","final":true,"state":{"records":4}}`,
			want:    `{"error":"CSV record 5: a quote inside an unquoted field","items":null}`,
		},
		{
			name:    "a request that is not JSON is refused",
			request: `{`,
			want:    `{"error":"invalid request JSON: unexpected end of JSON input","items":null}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := bridgeFormatReadCSV(tc.request); got != tc.want {
				t.Errorf("got  %s\nwant %s", got, tc.want)
			}
		})
	}
}

func TestBridgeFormatDecodeDelimiter(t *testing.T) {
	t.Parallel()

	refused := func(delimiter string) string {
		return `{"items":null,"error":"parse failed: [csv] failed to deserialize CSV: CSV delimiter ` +
			delimiter + ` must be non-empty and hold no quote, CR or LF"}`
	}

	cases := []struct {
		name    string
		request string
		want    string
	}{
		{
			name:    "the given delimiter separates the fields",
			request: `{"format":"csv","text":"a;b\n1;2\n","delimiter":";"}`,
			want:    `{"items":[{"a":"1","b":"2"}]}`,
		},
		{
			name:    "a delimiter left out is a comma",
			request: `{"format":"csv","text":"a;b,c\n1;2,3\n"}`,
			want:    `{"items":[{"a;b":"1;2","c":"3"}]}`,
		},
		{
			name:    "a delimiter of several characters reads with the given headers",
			request: `{"format":"csv","text":"1::2\n","delimiter":"::","headers":["x","y"]}`,
			want:    `{"items":[{"x":"1","y":"2"}]}`,
		},
		{
			name:    "an empty delimiter is refused",
			request: `{"format":"csv","text":"a\n1\n","delimiter":""}`,
			want:    refused(`\"\"`),
		},
		{
			name:    "a quote is refused",
			request: `{"format":"csv","text":"a\n1\n","delimiter":"\""}`,
			want:    refused(`\"\\\"\"`),
		},
		{
			name:    "CR is refused",
			request: `{"format":"csv","text":"a\n1\n","delimiter":"\r"}`,
			want:    refused(`\"\\r\"`),
		},
		{
			name:    "LF is refused",
			request: `{"format":"csv","text":"a\n1\n","delimiter":"\n"}`,
			want:    refused(`\"\\n\"`),
		},
		{
			name:    "other formats ignore the delimiter",
			request: `{"format":"json","text":"{\"a\":1}","delimiter":""}`,
			want:    `{"items":[{"a":1}]}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := bridgeFormatDecode(tc.request); got != tc.want {
				t.Errorf("got  %s\nwant %s", got, tc.want)
			}
		})
	}
}

func TestBridgeFormatEncodeDelimiter(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name    string
		encode  func(string) string
		request string
		want    string
	}{
		{
			name:    "formatEncodeDocument writes with the given delimiter",
			encode:  bridgeFormatEncodeDocument,
			request: `{"format":"csv","items":[{"a":1,"b":2},{"a":3,"b":"x;y"}],"delimiter":";"}`,
			want:    `{"result":"a;b\n1;2\n3;\"x;y\"\n"}`,
		},
		{
			name:    "formatEncodeDocument writes with a comma when the delimiter is left out",
			encode:  bridgeFormatEncodeDocument,
			request: `{"format":"csv","items":[{"a":1,"b":2}]}`,
			want:    `{"result":"a,b\n1,2\n"}`,
		},
		{
			name:    "formatEncodeDocument refuses a quote",
			encode:  bridgeFormatEncodeDocument,
			request: `{"format":"csv","items":[{"a":1}],"delimiter":"\""}`,
			want:    `{"result":"","error":"writeItem[0]: [csv] failed to write CSV: CSV delimiter \"\\\"\" must be non-empty and hold no quote, CR or LF"}`,
		},
		{
			name:    "formatEncodeDocument refuses a delimiter of several characters",
			encode:  bridgeFormatEncodeDocument,
			request: `{"format":"csv","items":[{"a":1}],"delimiter":"::"}`,
			want:    `{"result":"","error":"writeItem[0]: [csv] failed to write CSV: CSV delimiter \"::\" must be one character"}`,
		},
		{
			name:    "formatEncode writes with the given delimiter",
			encode:  bridgeFormatEncode,
			request: `{"format":"csv","data":{"a":1,"b":2},"isFirst":true,"delimiter":";"}`,
			want:    `{"result":"a;b\n1;2\n"}`,
		},
		{
			name:    "formatEncode refuses an empty delimiter",
			encode:  bridgeFormatEncode,
			request: `{"format":"csv","data":{"a":1},"delimiter":""}`,
			want:    `{"result":"","error":"[csv] failed to write CSV: CSV delimiter \"\" must be non-empty and hold no quote, CR or LF"}`,
		},
		{
			name:    "other formats ignore the delimiter",
			encode:  bridgeFormatEncode,
			request: `{"format":"json","data":{"a":1},"document":true,"delimiter":""}`,
			want:    `{"result":"{\"a\":1}\n"}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			if got := tc.encode(tc.request); got != tc.want {
				t.Errorf("got  %s\nwant %s", got, tc.want)
			}
		})
	}
}

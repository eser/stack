// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package textfile reads configuration files as text the way the TypeScript
// library read them, so both sides see the same characters.
package textfile

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// ByteOrderMark is the UTF-8 byte order mark as a string.
const ByteOrderMark = "\xef\xbb\xbf"

// Decode turns UTF-8 bytes into text as the WHATWG decoder does (TextDecoder
// and Node's Buffer.toString): each maximal invalid subpart becomes one
// U+FFFD. A byte order mark stays; callers that strip it say so.
func Decode(data []byte) string {
	if utf8.Valid(data) {
		return string(data)
	}

	var out strings.Builder

	out.Grow(len(data))

	for i := 0; i < len(data); {
		b := data[i]
		if b < utf8.RuneSelf {
			out.WriteByte(b)
			i++

			continue
		}

		need, lower, upper := sequenceShape(b)
		if need == 0 {
			out.WriteRune(utf8.RuneError)
			i++

			continue
		}

		j := i + 1
		valid := true

		for range need {
			if j >= len(data) || data[j] < lower || data[j] > upper {
				valid = false

				break
			}

			lower, upper = 0x80, 0xBF
			j++
		}

		if !valid {
			// The byte that broke the sequence starts the next one.
			out.WriteRune(utf8.RuneError)
			i = j

			continue
		}

		out.Write(data[i:j])
		i = j
	}

	return out.String()
}

// sequenceShape gives the continuation bytes a lead byte needs and the range
// of the first of them, or need 0 for a byte that cannot lead.
func sequenceShape(b byte) (need int, lower, upper byte) {
	lower, upper = 0x80, 0xBF

	switch {
	case b >= 0xC2 && b <= 0xDF:
		return 1, lower, upper
	case b == 0xE0:
		return 2, 0xA0, upper
	case b == 0xED:
		return 2, lower, 0x9F
	case b >= 0xE1 && b <= 0xEF:
		return 2, lower, upper
	case b == 0xF0:
		return 3, 0x90, upper
	case b == 0xF4:
		return 3, lower, 0x8F
	case b >= 0xF1 && b <= 0xF3:
		return 3, lower, upper
	default:
		return 0, lower, upper
	}
}

// ReadLimited reads the file at path, at most limit bytes when limit is not
// negative. It reports exceeded when the file holds more than limit bytes.
func ReadLimited(path string, limit int64) (data []byte, exceeded bool, err error) {
	file, err := os.Open(filepath.Clean(path))
	if err != nil {
		return nil, false, err //nolint:wrapcheck // callers match fs errors
	}

	defer file.Close() //nolint:errcheck // read-only

	if limit < 0 {
		data, err = io.ReadAll(file)
	} else {
		data, err = io.ReadAll(io.LimitReader(file, limit+1))
	}

	if err != nil {
		return nil, false, fmt.Errorf("read %q: %w", path, err)
	}

	if limit >= 0 && int64(len(data)) > limit {
		return nil, true, nil
	}

	return data, false, nil
}

package aifx

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
)

// sseMaxLineBytes caps one line of a server-sent event stream, which for these
// APIs is one JSON event. The vendor SDKs used the same 32 MiB.
const sseMaxLineBytes = bufio.MaxScanTokenSize << 9

// sseEvent is one server-sent event: its event name and its data lines, each
// followed by a newline.
type sseEvent struct {
	name string
	data []byte
}

// sseDecoder reads the event stream format the Anthropic and OpenAI APIs send:
// "event:" and "data:" lines, with a blank line ending each event. Comments and
// other fields are ignored, an event without data is skipped, and an event cut
// off by the end of the stream is dropped, as in the vendor SDKs.
type sseDecoder struct {
	scanner *bufio.Scanner
	event   sseEvent
	err     error
}

func newSSEDecoder(reader io.Reader) *sseDecoder {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(nil, sseMaxLineBytes)

	return &sseDecoder{scanner: scanner, event: sseEvent{name: "", data: nil}, err: nil}
}

// next reads the next event and reports whether there was one. After it
// returns false, err reports why the stream ended, or nil at its clean end.
func (d *sseDecoder) next() bool {
	if d.err != nil {
		return false
	}

	name := ""
	data := bytes.NewBuffer(nil)

	for d.scanner.Scan() {
		line := d.scanner.Bytes()

		if len(line) == 0 {
			// An event without data is not dispatched (the SSE rule), so a
			// keep-alive comment such as ": ping" is skipped. The OpenAI SDK
			// dispatched it and failed to decode the empty data.
			if data.Len() == 0 {
				name = ""

				continue
			}

			d.event = sseEvent{name: name, data: data.Bytes()}

			return true
		}

		field, value, _ := bytes.Cut(line, []byte(":"))
		if len(value) > 0 && value[0] == ' ' {
			value = value[1:]
		}

		switch string(field) {
		case "event":
			name = string(value)
		case "data":
			data.Write(value)
			data.WriteByte('\n')
		}
	}

	if err := d.scanner.Err(); err != nil {
		d.err = fmt.Errorf("read event stream (line limit %d bytes): %w", sseMaxLineBytes, err)
	}

	return false
}

// genAIChunkScanner splits a Gemini or Vertex AI stream into its chunks: the
// text between blank lines, as the genai SDK did, with a trailing carriage
// return removed.
func genAIChunkScanner(reader io.Reader) *bufio.Scanner {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 1024), sseMaxLineBytes) //nolint:mnd
	scanner.Split(splitGenAIChunks)

	return scanner
}

func splitGenAIChunks(data []byte, atEOF bool) (int, []byte, error) {
	if atEOF && len(data) == 0 {
		return 0, nil, nil
	}

	if idx := bytes.Index(data, []byte("\n\n")); idx >= 0 {
		return idx + 2, dropTrailingCR(data[:idx]), nil //nolint:mnd
	}

	if idx := bytes.Index(data, []byte("\r\n\r\n")); idx >= 0 {
		return idx + 4, dropTrailingCR(data[:idx]), nil //nolint:mnd
	}

	if atEOF {
		return len(data), dropTrailingCR(data), nil
	}

	return 0, nil, nil
}

func dropTrailingCR(data []byte) []byte {
	if len(data) > 0 && data[len(data)-1] == '\r' {
		return data[:len(data)-1]
	}

	return data
}

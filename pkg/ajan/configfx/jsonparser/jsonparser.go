package jsonparser

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

var ErrParsingError = errors.New("parsing error")

const Separator = "__"

func ParseBytes(data []byte, out *map[string]any) error {
	var raw map[string]any

	err := json.Unmarshal(data, &raw)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrParsingError, err)
	}

	flattenJSON(raw, "", out)

	return nil
}

func Parse(m *map[string]any, r io.Reader) error { //nolint:varnamelen
	var buf bytes.Buffer

	_, err := io.Copy(&buf, r)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrParsingError, err)
	}

	return ParseBytes(buf.Bytes(), m)
}

func tryParseFile(m *map[string]any, filename string) (err error) { //nolint:varnamelen
	file, fileErr := os.Open(filepath.Clean(filename))
	if fileErr != nil {
		if os.IsNotExist(fileErr) {
			return nil
		}

		return fmt.Errorf("%w: %w", ErrParsingError, fileErr)
	}

	defer func() {
		err = file.Close()
	}()

	return Parse(m, file)
}

func TryParseFiles(m *map[string]any, filenames ...string) error {
	for _, filename := range filenames {
		err := tryParseFile(m, filename)
		if err != nil {
			return err
		}
	}

	return nil
}

func flattenJSON(input map[string]any, currentNode string, out *map[string]any) {
	prefix := currentNode
	if len(prefix) > 0 {
		prefix += Separator
	}

	for key, value := range input {
		mapValue, isMap := value.(map[string]any)

		if isMap {
			if len(mapValue) > 0 {
				flattenJSON(mapValue, prefix+key, out)
			} else {
				(*out)[prefix+key] = ""
			}

			continue
		}

		// if false {
		arrValue, isArray := value.([]any)
		if isArray {
			for i, item := range arrValue {
				// Handle array items recursively if they are maps
				if itemMap, ok := item.(map[string]any); ok {
					flattenJSON(itemMap, fmt.Sprintf("%s%s%s%d", prefix, key, Separator, i), out)
				} else {
					// Otherwise just store the value
					(*out)[fmt.Sprintf("%s%s%s%d", prefix, key, Separator, i)] = fmt.Sprintf("%v", item)
				}
			}

			continue
		}

		(*out)[prefix+key] = fmt.Sprintf("%v", value)
		// } else {
		// 	(*out)[prefix+key] = value
		// }
	}
}

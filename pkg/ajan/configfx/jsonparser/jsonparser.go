package jsonparser

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

var ErrParsingError = errors.New("parsing error")

const Separator = "__"

// ParseBytes flattens the JSON object in data into out, joining nested keys
// with Separator. Numbers keep the text they were written with, so 1048576
// stays "1048576" instead of becoming "1.048576e+06".
func ParseBytes(data []byte, out *map[string]any) error {
	var raw map[string]any

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()

	err := decoder.Decode(&raw)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrParsingError, err)
	}

	// Decode stops after the first value; json.Unmarshal, used before,
	// rejected anything after it, and so does this check.
	_, err = decoder.Token()
	if !errors.Is(err, io.EOF) {
		return fmt.Errorf(
			"%w: unexpected data after the top-level JSON object, keep one object per file",
			ErrParsingError,
		)
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

	// Assign only when the parse itself succeeded. This used to be a bare
	// `err = file.Close()`, which overwrote the named return unconditionally --
	// so Close's nil erased the parse error and a truncated or malformed file
	// was indistinguishable from a valid one.
	defer func() {
		closeErr := file.Close()
		if err == nil && closeErr != nil {
			err = fmt.Errorf("%w: %w", ErrParsingError, closeErr)
		}
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

// flattenJSON writes input into out with nested keys joined by Separator.
// Later calls override earlier ones key by key, and array items merge by
// index. An array also removes a value an earlier call set at its own key,
// and an empty array sets that key to an empty value, which configfx loads as
// an empty slice. null removes the key and every key under it, so the field
// falls back to its default.
func flattenJSON(input map[string]any, currentNode string, out *map[string]any) {
	prefix := currentNode
	if len(prefix) > 0 {
		prefix += Separator
	}

	for key, value := range input {
		fullKey := prefix + key

		switch typed := value.(type) {
		case nil:
			removeKeyAndChildren(out, fullKey)
		case map[string]any:
			if len(typed) > 0 {
				flattenJSON(typed, fullKey, out)
			} else {
				(*out)[fullKey] = ""
			}
		case []any:
			removeKey(out, fullKey)

			if len(typed) == 0 {
				(*out)[fullKey] = ""

				continue
			}

			for i, item := range typed {
				itemKey := fullKey + Separator + strconv.Itoa(i)

				switch typedItem := item.(type) {
				case nil:
					// A null item leaves a gap, which loads as the zero value.
				case map[string]any:
					flattenJSON(typedItem, itemKey, out)
				default:
					(*out)[itemKey] = fmt.Sprintf("%v", item)
				}
			}
		default:
			(*out)[fullKey] = fmt.Sprintf("%v", value)
		}
	}
}

// removeKey deletes key from out, matching case-insensitively as configfx
// reads keys.
func removeKey(out *map[string]any, key string) {
	for existingKey := range *out {
		if strings.EqualFold(existingKey, key) {
			delete(*out, existingKey)
		}
	}
}

// removeKeyAndChildren deletes key and every key nested under it from out,
// matching case-insensitively as configfx reads keys.
func removeKeyAndChildren(out *map[string]any, key string) {
	childPrefix := strings.ToLower(key + Separator)

	for existingKey := range *out {
		if strings.EqualFold(existingKey, key) ||
			strings.HasPrefix(strings.ToLower(existingKey), childPrefix) {
			delete(*out, existingKey)
		}
	}
}

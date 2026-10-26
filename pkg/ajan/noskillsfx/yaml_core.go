// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// The manifest guard compares the noskills section before and after an edit
// as the TypeScript CLI reads it, which parses YAML with the YAML 1.2 core
// schema of the yaml package: plain scalars are null, a boolean, a number or a
// string by the core schema's patterns, merge keys are ordinary keys, and a
// file with several documents or a repeated key does not parse. yaml.v3
// builds the node tree; the scalars are resolved here, because yaml.v3's own
// resolver differs (it reads 012 as octal, for one).

var (
	errYAMLMultipleDocuments = errors.New("the YAML text holds more than one document")
	errYAMLDuplicateKey      = errors.New("map keys must be unique")
	errYAMLComplexKey        = errors.New("a map key is a collection")
)

//nolint:gochecknoglobals // compiled once, read-only
var (
	yamlCoreInt      = regexp.MustCompile(`^[-+]?[0-9]+$`)
	yamlCoreOctal    = regexp.MustCompile(`^0o[0-7]+$`)
	yamlCoreHex      = regexp.MustCompile(`^0x[0-9a-fA-F]+$`)
	yamlCoreInf      = regexp.MustCompile(`^[-+]?\.(?:inf|Inf|INF)$`)
	yamlCoreNaN      = regexp.MustCompile(`^\.(?:nan|NaN|NAN)$`)
	yamlCoreFloatExp = regexp.MustCompile(`^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$`)
	yamlCoreFloat    = regexp.MustCompile(`^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$`)
)

// parseYAMLCore parses one YAML document into JavaScript-like values (see
// js_json.go): what `yaml.parse` from the yaml package returns. An empty text is
// null.
func parseYAMLCore(text string) (any, error) {
	dec := yaml.NewDecoder(strings.NewReader(text))

	var document yaml.Node

	err := dec.Decode(&document)
	if errors.Is(err, io.EOF) {
		return nil, nil
	}

	if err != nil {
		return nil, fmt.Errorf("parse YAML: %w", err)
	}

	var next yaml.Node
	if err := dec.Decode(&next); !errors.Is(err, io.EOF) {
		return nil, errYAMLMultipleDocuments
	}

	if len(document.Content) == 0 {
		return nil, nil
	}

	return yamlNodeValue(document.Content[0])
}

func yamlNodeValue(node *yaml.Node) (any, error) {
	switch node.Kind {
	case yaml.DocumentNode:
		if len(node.Content) == 0 {
			return nil, nil
		}

		return yamlNodeValue(node.Content[0])
	case yaml.AliasNode:
		return yamlNodeValue(node.Alias)
	case yaml.SequenceNode:
		items := make([]any, 0, len(node.Content))

		for _, child := range node.Content {
			value, err := yamlNodeValue(child)
			if err != nil {
				return nil, err
			}

			items = append(items, value)
		}

		return items, nil
	case yaml.MappingNode:
		return yamlMappingValue(node)
	case yaml.ScalarNode:
		return yamlScalarValue(node), nil
	default:
		return nil, nil
	}
}

func yamlMappingValue(node *yaml.Node) (any, error) {
	o := NewJSObject()

	var seen []any

	for i := 0; i+1 < len(node.Content); i += 2 {
		keyNode := node.Content[i]
		for keyNode.Kind == yaml.AliasNode {
			keyNode = keyNode.Alias
		}

		if keyNode.Kind != yaml.ScalarNode {
			return nil, errYAMLComplexKey
		}

		keyValue := yamlScalarValue(keyNode)
		if slices.ContainsFunc(seen, func(v any) bool { return sameYAMLScalar(v, keyValue) }) {
			return nil, fmt.Errorf("%w: %q", errYAMLDuplicateKey, keyNode.Value)
		}

		seen = append(seen, keyValue)

		value, err := yamlNodeValue(node.Content[i+1])
		if err != nil {
			return nil, err
		}

		o.set(jsKeyString(keyValue), value)
	}

	return o, nil
}

// sameYAMLScalar reports whether two resolved scalars are the same key, as
// the uniqueKeys check compares them (by value, so 1 and 0x1 collide).
func sameYAMLScalar(a, b any) bool {
	switch x := a.(type) {
	case float64:
		y, ok := b.(float64)

		return ok && x == y
	default:
		return a == b
	}
}

// jsKeyString is the property name a scalar key becomes: String(value), and
// "" for null.
func jsKeyString(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case bool:
		return strconv.FormatBool(v)
	case float64:
		switch {
		case math.IsNaN(v):
			return "NaN"
		case math.IsInf(v, 1):
			return "Infinity"
		case math.IsInf(v, -1):
			return "-Infinity"
		default:
			return jsNumberString(v)
		}
	case string:
		return v
	default:
		return fmt.Sprint(v)
	}
}

// yamlScalarValue resolves a scalar by the YAML 1.2 core schema. Quoted and
// block scalars, and scalars with a tag outside the standard ones, are
// strings.
func yamlScalarValue(node *yaml.Node) any {
	if node.Style&(yaml.DoubleQuotedStyle|yaml.SingleQuotedStyle|yaml.LiteralStyle|yaml.FoldedStyle) != 0 {
		return node.Value
	}

	if node.Tag != "" && !strings.HasPrefix(node.Tag, "!!") {
		return node.Value
	}

	return resolveYAMLPlain(node.Value)
}

func resolveYAMLPlain(text string) any { //nolint:cyclop // one branch per core schema pattern
	switch text {
	case "", "~", "null", "Null", "NULL":
		return nil
	case "true", "True", "TRUE":
		return true
	case "false", "False", "FALSE":
		return false
	}

	switch {
	case yamlCoreOctal.MatchString(text):
		n, err := strconv.ParseUint(text[2:], 8, 64)
		if err == nil {
			return float64(n)
		}
	case yamlCoreInt.MatchString(text):
		f, _ := strconv.ParseFloat(text, 64)

		return f
	case yamlCoreHex.MatchString(text):
		n, err := strconv.ParseUint(text[2:], 16, 64)
		if err == nil {
			return float64(n)
		}
	case yamlCoreInf.MatchString(text):
		if text[0] == '-' {
			return math.Inf(-1)
		}

		return math.Inf(1)
	case yamlCoreNaN.MatchString(text):
		return math.NaN()
	case yamlCoreFloatExp.MatchString(text), yamlCoreFloat.MatchString(text):
		f, _ := strconv.ParseFloat(text, 64)

		return f
	}

	return text
}

// canonicalJSON is JSON.stringify with every object's keys sorted, so key
// order does not count when two values are compared. It returns "" and false
// for undefined (a missing value).
func canonicalJSON(value any, present bool) (string, bool) {
	if !present {
		return "", false
	}

	var b bytes.Buffer
	writeJSON(&b, sortedJSValue(value), "", "")

	return b.String(), true
}

func sortedJSValue(value any) any {
	switch v := value.(type) {
	case []any:
		items := make([]any, len(v))
		for i, item := range v {
			items[i] = sortedJSValue(item)
		}

		return items
	case *JSObject:
		keys := slices.Clone(v.keys)
		slices.Sort(keys)

		o := NewJSObject()
		for _, key := range keys {
			o.set(key, sortedJSValue(v.values[key]))
		}

		return o
	default:
		return value
	}
}

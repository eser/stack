// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx

import (
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"
)

// Errors of SchemaOf.
var (
	// ErrUnsupportedType is returned for a Go type JSON cannot carry: a
	// channel, a function, a complex number, or a map whose key is not a string.
	ErrUnsupportedType = errors.New("type has no JSON Schema")
	// ErrRecursiveType is returned for a struct that holds itself. The schema
	// has no references yet, so a recursive type is not described.
	ErrRecursiveType = errors.New("recursive type has no JSON Schema")
)

// SchemaOf derives the JSON Schema (draft 2020-12) of the Go type T, the way
// encoding/json reads and writes it, so the Go struct of a function is the
// source of its schema and of the TypeScript types generated from it (ADR 0011).
//
//   - A struct is an object. A field is named by its json tag, is skipped by
//     `json:"-"` or when it is not exported, and is required unless the tag has
//     omitempty or omitzero. A `description:"text"` tag becomes its description.
//     The schema does not forbid additional properties, as the decoder ignores
//     unknown fields.
//   - A pointer is nullable unless the field is optional.
//   - A slice or array is an array, and a map with a string key is an object
//     whose values have the schema of the element.
//   - Integers are "integer" and floats "number". any, json.RawMessage and
//     other interfaces have no type, so they accept anything. time.Time is a
//     date-time string, and []byte is a base64 string.
//
// A struct that holds itself, and a type JSON cannot carry, are errors.
func SchemaOf[T any]() (json.RawMessage, error) {
	node, err := schemaOfType(reflect.TypeFor[T](), map[reflect.Type]bool{})
	if err != nil {
		return nil, fmt.Errorf("schema of %s: %w", reflect.TypeFor[T](), err)
	}

	encoded, err := json.Marshal(node)
	if err != nil {
		return nil, fmt.Errorf("encode the schema of %s: %w", reflect.TypeFor[T](), err)
	}

	return encoded, nil
}

// WithSchemasOf sets the input and output schemas of a function from its Go
// types. A type that has no schema makes NewFunction fail with SchemaOf's error.
func WithSchemasOf[I, O any]() Option {
	return func(descriptor *Descriptor) error {
		input, err := SchemaOf[I]()
		if err != nil {
			return err
		}

		output, err := SchemaOf[O]()
		if err != nil {
			return err
		}

		descriptor.InputSchema = input
		descriptor.OutputSchema = output

		return nil
	}
}

type schemaNode = map[string]any

var (
	timeType       = reflect.TypeFor[time.Time]()
	rawMessageType = reflect.TypeFor[json.RawMessage]()
)

func schemaOfType(typ reflect.Type, inProgress map[reflect.Type]bool) (schemaNode, error) {
	switch typ {
	case timeType:
		return schemaNode{"type": "string", "format": "date-time"}, nil
	case rawMessageType:
		return schemaNode{}, nil
	}

	switch typ.Kind() { //nolint:exhaustive // the other kinds have no JSON form
	case reflect.Bool:
		return schemaNode{"type": "boolean"}, nil
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return schemaNode{"type": "integer"}, nil
	case reflect.Float32, reflect.Float64:
		return schemaNode{"type": "number"}, nil
	case reflect.String:
		return schemaNode{"type": "string"}, nil
	case reflect.Interface:
		return schemaNode{}, nil
	case reflect.Pointer:
		return schemaOfType(typ.Elem(), inProgress)
	case reflect.Slice, reflect.Array:
		if typ.Elem().Kind() == reflect.Uint8 {
			return schemaNode{"type": "string", "contentEncoding": "base64"}, nil
		}

		items, err := schemaOfType(typ.Elem(), inProgress)
		if err != nil {
			return nil, err
		}

		return schemaNode{"type": "array", "items": items}, nil
	case reflect.Map:
		if typ.Key().Kind() != reflect.String {
			return nil, fmt.Errorf("%w: map key %s is not a string", ErrUnsupportedType, typ.Key())
		}

		values, err := schemaOfType(typ.Elem(), inProgress)
		if err != nil {
			return nil, err
		}

		return schemaNode{"type": "object", "additionalProperties": values}, nil
	case reflect.Struct:
		return schemaOfStruct(typ, inProgress)
	default:
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedType, typ)
	}
}

// fieldOf is one JSON field of a struct.
type fieldOf struct {
	schema   schemaNode
	name     string
	required bool
}

func schemaOfStruct(typ reflect.Type, inProgress map[reflect.Type]bool) (schemaNode, error) {
	if inProgress[typ] {
		return nil, fmt.Errorf("%w: %s", ErrRecursiveType, typ)
	}

	inProgress[typ] = true

	defer delete(inProgress, typ)

	fields, err := fieldsOf(typ, inProgress)
	if err != nil {
		return nil, err
	}

	properties := schemaNode{}
	required := make([]string, 0, len(fields))

	for _, field := range fields {
		properties[field.name] = field.schema

		if field.required {
			required = append(required, field.name)
		}
	}

	node := schemaNode{"type": "object", "properties": properties}
	if len(required) > 0 {
		node["required"] = required
	}

	return node, nil
}

func fieldsOf(typ reflect.Type, inProgress map[reflect.Type]bool) ([]fieldOf, error) {
	fields := make([]fieldOf, 0, typ.NumField())

	for field := range typ.Fields() {
		tag := field.Tag.Get("json")

		if tag == "-" {
			continue
		}

		name, options, _ := strings.Cut(tag, ",")

		// An embedded struct without a tag contributes its fields, as it does
		// to encoding/json.
		if field.Anonymous && name == "" && field.Type.Kind() == reflect.Struct {
			inner, err := fieldsOf(field.Type, inProgress)
			if err != nil {
				return nil, err
			}

			fields = append(fields, inner...)

			continue
		}

		if !field.IsExported() {
			continue
		}

		if name == "" {
			name = field.Name
		}

		node, err := schemaOfType(field.Type, inProgress)
		if err != nil {
			return nil, fmt.Errorf("field %s: %w", field.Name, err)
		}

		optional := hasOption(options, "omitempty") || hasOption(options, "omitzero")

		if field.Type.Kind() == reflect.Pointer && !optional {
			node = schemaNode{"anyOf": []schemaNode{node, {"type": "null"}}}
		}

		if description := field.Tag.Get("description"); description != "" {
			node["description"] = description
		}

		fields = append(fields, fieldOf{name: name, schema: node, required: !optional})
	}

	return fields, nil
}

func hasOption(options, want string) bool {
	for option := range strings.SplitSeq(options, ",") {
		if option == want {
			return true
		}
	}

	return false
}

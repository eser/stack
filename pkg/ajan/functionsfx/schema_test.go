// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/functionsfx"
)

type address struct {
	Street string `json:"street"`
	Zip    *int   `json:"zip,omitempty"`
}

type person struct {
	Born     time.Time         `json:"born,omitzero"`
	Extra    json.RawMessage   `json:"extra,omitempty"`
	Meta     map[string]string `json:"meta,omitempty"`
	Home     *address          `json:"home"`
	Name     string            `json:"name" description:"The full name"`
	Nick     string            `json:"nick,omitempty"`
	Skip     string            `json:"-"`
	hidden   string            //nolint:unused // an unexported field, which the schema must skip
	Tags     []string          `json:"tags"`
	Age      int               `json:"age"`
	Score    float64           `json:"score,omitempty"`
	Verified bool              `json:"verified"`
}

type loop struct {
	Next *loop `json:"next,omitempty"`
}

type withChannel struct {
	Events chan int `json:"events"`
}

type embedded struct {
	address
	Label string `json:"label"`
}

func schemaOf[T any](t *testing.T) map[string]any {
	t.Helper()

	raw, err := functionsfx.SchemaOf[T]()
	if err != nil {
		t.Fatalf("SchemaOf: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatalf("decode %s: %v", raw, err)
	}

	return decoded
}

func TestSchemaOfAStruct(t *testing.T) {
	t.Parallel()

	schema := schemaOf[person](t)
	properties, _ := schema["properties"].(map[string]any)

	if schema["type"] != "object" {
		t.Errorf("type = %v, want object", schema["type"])
	}

	if _, forbidden := schema["additionalProperties"]; forbidden {
		t.Error("the schema forbids additional properties, which the decoder accepts")
	}

	for _, skipped := range []string{"Skip", "hidden", "-"} {
		if _, present := properties[skipped]; present {
			t.Errorf("property %q is in the schema, want it left out", skipped)
		}
	}

	required, _ := schema["required"].([]any)
	gotRequired := map[string]bool{}

	for _, name := range required {
		gotRequired[name.(string)] = true //nolint:forcetypeassert
	}

	for _, name := range []string{"home", "name", "tags", "age", "verified"} {
		if !gotRequired[name] {
			t.Errorf("%q is not required, want it required", name)
		}
	}

	for _, name := range []string{"born", "extra", "meta", "nick", "score"} {
		if gotRequired[name] {
			t.Errorf("%q is required, want it optional (omitempty or omitzero)", name)
		}
	}

	checks := map[string]string{
		"name": "string", "age": "integer", "score": "number", "verified": "boolean", "tags": "array", "meta": "object",
	}

	for name, want := range checks {
		property, _ := properties[name].(map[string]any)
		if property["type"] != want {
			t.Errorf("property %q type = %v, want %s", name, property["type"], want)
		}
	}

	if name, _ := properties["name"].(map[string]any); name["description"] != "The full name" {
		t.Errorf("description = %v, want the description tag", name["description"])
	}

	if born, _ := properties["born"].(map[string]any); born["format"] != "date-time" {
		t.Errorf("born = %v, want a date-time string", born)
	}

	if extra, _ := properties["extra"].(map[string]any); len(extra) != 0 {
		t.Errorf("extra = %v, want a schema that accepts anything", extra)
	}
}

func TestAPointerWithoutOmitemptyIsNullable(t *testing.T) {
	t.Parallel()

	properties, _ := schemaOf[person](t)["properties"].(map[string]any)
	home, _ := properties["home"].(map[string]any)

	anyOf, _ := home["anyOf"].([]any)
	if len(anyOf) != 2 {
		t.Fatalf("home = %v, want an anyOf of the struct and null", home)
	}

	if null, _ := anyOf[1].(map[string]any); null["type"] != "null" {
		t.Errorf("home anyOf[1] = %v, want null", anyOf[1])
	}

	// With omitempty the field is optional and not nullable.
	inner, _ := home["anyOf"].([]any)[0].(map[string]any)
	innerProperties, _ := inner["properties"].(map[string]any)

	zip, _ := innerProperties["zip"].(map[string]any)
	if zip["type"] != "integer" {
		t.Errorf("zip = %v, want a plain integer for an optional pointer", zip)
	}
}

func TestAnEmbeddedStructContributesItsFields(t *testing.T) {
	t.Parallel()

	properties, _ := schemaOf[embedded](t)["properties"].(map[string]any)

	for _, name := range []string{"street", "zip", "label"} {
		if _, present := properties[name]; !present {
			t.Errorf("property %q is missing from %v", name, properties)
		}
	}
}

func TestSchemaOfScalarsAndCollections(t *testing.T) {
	t.Parallel()

	if got := schemaOf[string](t)["type"]; got != "string" {
		t.Errorf("string = %v", got)
	}

	if got := schemaOf[[]byte](t)["contentEncoding"]; got != "base64" {
		t.Errorf("[]byte = %v, want a base64 string", got)
	}

	list := schemaOf[[]int](t)
	if items, _ := list["items"].(map[string]any); list["type"] != "array" || items["type"] != "integer" {
		t.Errorf("[]int = %v", list)
	}

	if got := schemaOf[any](t); len(got) != 0 {
		t.Errorf("any = %v, want a schema that accepts anything", got)
	}
}

func TestSchemaOfRefusesWhatJSONCannotCarry(t *testing.T) {
	t.Parallel()

	if _, err := functionsfx.SchemaOf[withChannel](); !errors.Is(err, functionsfx.ErrUnsupportedType) {
		t.Errorf("channel field: error = %v, want ErrUnsupportedType", err)
	}

	if _, err := functionsfx.SchemaOf[map[int]string](); !errors.Is(err, functionsfx.ErrUnsupportedType) {
		t.Errorf("int-keyed map: error = %v, want ErrUnsupportedType", err)
	}

	if _, err := functionsfx.SchemaOf[loop](); !errors.Is(err, functionsfx.ErrRecursiveType) {
		t.Errorf("recursive struct: error = %v, want ErrRecursiveType", err)
	}
}

func TestWithSchemasOfSetsBothSchemas(t *testing.T) {
	t.Parallel()

	function, err := functionsfx.NewFunction("people",
		functionsfx.Handler[address, person](func(context.Context, address) (person, error) { return person{}, nil }),
		functionsfx.WithSchemasOf[address, person](),
	)
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	descriptor := function.Descriptor()
	if len(descriptor.InputSchema) == 0 || len(descriptor.OutputSchema) == 0 {
		t.Fatalf("descriptor = %+v, want both schemas", descriptor)
	}

	// The input schema is enforced: a street is required.
	if _, err := function.Call(t.Context(), json.RawMessage(`{"zip":1}`)); !functionsfx.IsKind(err, functionsfx.KindValidation) {
		t.Errorf("a call without the required field: error = %v, want a ValidationError", err)
	}
}

func TestWithSchemasOfFailsForATypeWithoutASchema(t *testing.T) {
	t.Parallel()

	_, err := functionsfx.NewFunction("bad",
		functionsfx.Handler[withChannel, string](func(context.Context, withChannel) (string, error) { return "", nil }),
		functionsfx.WithSchemasOf[withChannel, string](),
	)
	if !errors.Is(err, functionsfx.ErrUnsupportedType) {
		t.Errorf("error = %v, want ErrUnsupportedType", err)
	}
}

func TestWithOwner(t *testing.T) {
	t.Parallel()

	handler := functionsfx.Handler[string, string](func(_ context.Context, input string) (string, error) { return input, nil })

	function, err := functionsfx.NewFunction("owned", handler, functionsfx.WithOwner("@eserstack/codebase"))
	if err != nil {
		t.Fatalf("NewFunction: %v", err)
	}

	if got := function.Descriptor().Owner; got != "@eserstack/codebase" {
		t.Errorf("owner = %q", got)
	}

	for _, bad := range []string{"", "codebase", "@eserstack", "@eserstack/", "@Eserstack/codebase", "eserstack/codebase"} {
		if _, err := functionsfx.NewFunction("owned", handler, functionsfx.WithOwner(bad)); !errors.Is(err, functionsfx.ErrInvalidOwner) {
			t.Errorf("owner %q: error = %v, want ErrInvalidOwner", bad, err)
		}
	}
}

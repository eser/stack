// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"encoding/json"
	"fmt"
	"strings"

	jsonschema "github.com/santhosh-tekuri/jsonschema/v6"
)

// ValidateStepInput validates input against a JSON Schema (draft-2020-12).
// schemaJSON must be a valid JSON Schema document as raw bytes.
// input is the merged step options map after interpolation.
// Returns nil if valid, a descriptive error otherwise.
func ValidateStepInput(schemaJSON json.RawMessage, input map[string]any) error {
	schemaDoc, err := jsonschema.UnmarshalJSON(strings.NewReader(string(schemaJSON)))
	if err != nil {
		return fmt.Errorf("invalid schema: %w", err)
	}

	c := jsonschema.NewCompiler()

	if err := c.AddResource("step-schema.json", schemaDoc); err != nil {
		return fmt.Errorf("schema resource: %w", err)
	}

	sch, err := c.Compile("step-schema.json")
	if err != nil {
		return fmt.Errorf("schema compile: %w", err)
	}

	// Round-trip through JSON to get a type-clean interface{} for the validator.
	data, err := json.Marshal(input)
	if err != nil {
		return fmt.Errorf("marshal input: %w", err)
	}

	instance, err := jsonschema.UnmarshalJSON(strings.NewReader(string(data)))
	if err != nil {
		return fmt.Errorf("unmarshal input: %w", err)
	}

	return sch.Validate(instance)
}

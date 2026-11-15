// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package validatortools

// The JSON Schemas of the validator functions. They describe the options the
// code reads (validatortools.go, manifest_parity.go, manifest_tools.go and the
// Parse* functions of codebasefx), and none of them forbids additional
// properties: the workflow engine adds root, fix, dryRun, _args and
// _changedFiles to every step, and a function takes the ones it needs.

type schema = map[string]any

func stringSchema() schema { return schema{"type": "string"} }

func booleanSchema() schema { return schema{"type": "boolean"} }

func integerSchema(minimum int) schema { return schema{"type": "integer", "minimum": minimum} }

func stringListSchema() schema {
	return schema{"type": "array", "items": stringSchema()}
}

// commonOptions are the options of every validator that walks files.
func commonOptions() schema {
	return schema{
		"root":          stringSchema(),
		"cwd":           stringSchema(),
		"extensions":    stringListSchema(),
		"exclude":       stringListSchema(),
		"fix":           booleanSchema(),
		"dryRun":        booleanSchema(),
		"_changedFiles": stringListSchema(),
	}
}

// wholeRepositoryTools check the tree once and take no file options.
var wholeRepositoryTools = map[string]bool{ //nolint:gochecknoglobals
	"validate-circular-deps":     true,
	"validate-mod-exports":       true,
	"validate-export-names":      true,
	"validate-docs":              true,
	"validate-laroux-boundaries": true,
	"validate-commit-msg":        true,
}

func filenameRulesSchema() schema {
	rule := schema{
		"type": "object",
		"properties": schema{
			"directory":  schema{"type": "string", "minLength": 1},
			"convention": schema{"enum": []string{"kebab-case", "snake_case"}},
			"exclude":    stringListSchema(),
		},
		"required": []string{"directory", "convention"},
	}

	// The option is a list of rules or the JSON text of one.
	return schema{"oneOf": []schema{{"type": "array", "items": rule}, stringSchema()}}
}

// optionsOf lists the options a validator reads beyond the common ones.
func optionsOf(name string) schema {
	switch name {
	case "codebase-large-file", "validate-large-files":
		return schema{"maxKb": integerSchema(0)}
	case "validate-yaml":
		return schema{"allowMultipleDocuments": booleanSchema()}
	case "codebase-filenames", "validate-filenames":
		return schema{"rules": filenameRulesSchema(), "globalExcludes": stringListSchema()}
	case "codebase-code-conventions", "validate-code-conventions":
		return schema{"baseline": stringSchema()}
	case "codebase-naming-and-todos", "validate-naming-and-todos":
		return schema{"allowNames": stringListSchema()}
	case "codebase-server-loc", "validate-server-loc":
		return schema{
			"directory":     stringSchema(),
			"maxLines":      integerSchema(0),
			"excludeSuffix": stringSchema(),
			"extension":     stringSchema(),
		}
	case "codebase-error-coverage", "validate-error-coverage":
		return schema{
			"file":           stringSchema(),
			"errorObjects":   stringListSchema(),
			"requiredFields": stringListSchema(),
		}
	case "validate-export-names":
		return schema{"ignoreWords": stringListSchema()}
	case "validate-docs":
		return schema{"requireExamples": booleanSchema()}
	case "validate-laroux-boundaries":
		return schema{"allowlist": stringSchema(), "exclude": stringListSchema()}
	case "validate-commit-msg":
		return schema{
			"commitMsgFile":       stringSchema(),
			"allowAsterisk":       booleanSchema(),
			"allowMultipleScopes": booleanSchema(),
			"forceScope":          booleanSchema(),
			"types":               stringListSchema(),
			"_args":               stringListSchema(),
		}
	default:
		return nil
	}
}

// requiredOf lists the options a validator refuses to run without.
func requiredOf(name string) []string {
	switch name {
	case "codebase-server-loc", "validate-server-loc":
		return []string{"directory"}
	case "codebase-error-coverage", "validate-error-coverage":
		return []string{"file"}
	default:
		return nil
	}
}

// inputSchemaOf builds the input schema of a validator function.
func inputSchemaOf(name string) schema {
	properties := schema{}

	if wholeRepositoryTools[name] {
		properties["root"] = stringSchema()
		properties["cwd"] = stringSchema()
	} else {
		for key, value := range commonOptions() {
			properties[key] = value
		}
	}

	for key, value := range optionsOf(name) {
		properties[key] = value
	}

	result := schema{"type": "object", "properties": properties}

	if required := requiredOf(name); len(required) > 0 {
		result["required"] = required
	}

	return result
}

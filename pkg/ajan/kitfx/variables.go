// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"regexp"
	"strings"
)

// varPattern matches {{.variableName}} — the Go template variable syntax used
// in recipe files. Whitespace is allowed around the dot-name.
// We use regex substitution rather than text/template.Execute because recipe
// files may themselves be Go template sources that must not be parsed/executed.
var varPattern = regexp.MustCompile(`\{\{\s*\.(\w+)\s*\}\}`)

// SubstituteVariables replaces all {{.varName}} occurrences in content with the
// corresponding value from vars. Unresolved variables are left as-is.
func SubstituteVariables(content string, vars map[string]string) string {
	return varPattern.ReplaceAllStringFunc(content, func(match string) string {
		sub := varPattern.FindStringSubmatch(match)
		if len(sub) < 2 {
			return match
		}

		name := sub[1]
		if val, ok := vars[name]; ok {
			return val
		}

		// Leave unresolved variables intact.
		return match
	})
}

// HasVariables reports whether content contains any {{.varName}} placeholders.
func HasVariables(content string) bool {
	return varPattern.MatchString(content)
}

// ResolveVariables merges recipe variable defaults with explicit overrides.
//
// Precedence: overrides > defaults from TemplateVariable.Default.
// Variables with no default and no override keep an empty string value, which
// allows callers to detect and prompt for missing required variables.
func ResolveVariables(recipe *Recipe, overrides map[string]string) map[string]string {
	result := make(map[string]string, len(recipe.Variables))

	for _, v := range recipe.Variables {
		if val, ok := overrides[v.Name]; ok {
			result[v.Name] = val
		} else {
			result[v.Name] = v.Default
		}
	}

	// Pass through any extra overrides not declared in recipe.Variables.
	for k, v := range overrides {
		if _, ok := result[k]; !ok {
			result[k] = v
		}
	}

	return result
}

// MissingVariables returns variable names that have no value in vars and have
// no default defined in the recipe's variable declarations.
func MissingVariables(recipe *Recipe, vars map[string]string) []string {
	var missing []string

	for _, v := range recipe.Variables {
		val, ok := vars[v.Name]
		if !ok || strings.TrimSpace(val) == "" {
			if v.Default == "" {
				missing = append(missing, v.Name)
			}
		}
	}

	return missing
}

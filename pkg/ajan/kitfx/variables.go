// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import (
	"context"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
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

	for i := range recipe.Variables {
		v := &recipe.Variables[i]

		val, ok := vars[v.Name]
		if !ok || strings.TrimSpace(val) == "" {
			if !v.HasDefault() {
				missing = append(missing, v.Name)
			}
		}
	}

	return missing
}

// MissingVariableError is a declared variable that got no value, has no
// default, and was not (or could not be) asked for.
type MissingVariableError struct {
	Name string
	// Err is why prompting ended, such as end of input; nil when prompting
	// was off.
	Err error
}

func (e *MissingVariableError) Error() string {
	message := fmt.Sprintf("required variable %q has no value and no default; pass --var %s=<value>", e.Name, e.Name)
	if e.Err != nil {
		message += ": " + e.Err.Error()
	}

	return message
}

func (e *MissingVariableError) Unwrap() error { return e.Err }

// ErrVariablePattern is wrapped when a value does not match its variable's
// pattern.
var ErrVariablePattern = errors.New("value does not match the pattern")

// maxPromptAttempts bounds how often one variable is asked for again after an
// empty or invalid answer.
const maxPromptAttempts = 10

// ValidateVariable checks value against the variable's Pattern, if any.
func ValidateVariable(variable *TemplateVariable, value string) error {
	if variable.Pattern == "" {
		return nil
	}

	pattern, err := regexp.Compile(variable.Pattern)
	if err != nil {
		return fmt.Errorf("variable %q: compile pattern %q: %w", variable.Name, variable.Pattern, err)
	}

	if !pattern.MatchString(value) {
		return fmt.Errorf("%w: value %q does not match pattern %s", ErrVariablePattern, value, variable.Pattern)
	}

	return nil
}

// ResolveRecipeVariables resolves the recipe's declared variables in order:
// the override when given (checked against its pattern), else the default,
// else an answer from prompt (asked again after an empty or invalid answer,
// with the reason on stderr), else a *MissingVariableError. With strict
// unset, a variable that is still missing resolves to "" and overrides that
// no variable declares pass through; with strict set they are dropped, as in
// the TypeScript kit.
func ResolveRecipeVariables(
	ctx context.Context,
	variables []TemplateVariable,
	overrides map[string]string,
	prompt PromptFunc,
	strict bool,
	stderr io.Writer,
) (map[string]string, error) {
	resolved := make(map[string]string, len(variables))

	for i := range variables {
		variable := &variables[i]

		if value, ok := overrides[variable.Name]; ok {
			if err := ValidateVariable(variable, value); err != nil {
				return nil, fmt.Errorf("variable %q: %w", variable.Name, err)
			}

			resolved[variable.Name] = value

			continue
		}

		if variable.HasDefault() {
			resolved[variable.Name] = variable.Default

			continue
		}

		if prompt != nil {
			value, err := promptVariable(ctx, variable, prompt, writerOrDiscard(stderr))
			if err != nil {
				return nil, err
			}

			resolved[variable.Name] = value

			continue
		}

		if strict {
			return nil, &MissingVariableError{Name: variable.Name, Err: nil}
		}

		resolved[variable.Name] = ""
	}

	if !strict {
		for name, value := range overrides {
			if _, ok := resolved[name]; !ok {
				resolved[name] = value
			}
		}
	}

	return resolved, nil
}

// promptVariable asks for one variable until the answer is non-empty and
// matches its pattern, at most maxPromptAttempts times.
func promptVariable(ctx context.Context, variable *TemplateVariable, prompt PromptFunc, stderr io.Writer) (string, error) {
	question := variable.Description
	if question == "" {
		question = variable.Name
	}

	if variable.HasDefault() {
		question += " [" + variable.Default + "]"
	}

	question += ": "

	for range maxPromptAttempts {
		answer, err := prompt(ctx, question)
		if err != nil {
			return "", &MissingVariableError{Name: variable.Name, Err: err}
		}

		if answer == "" {
			continue
		}

		if err := ValidateVariable(variable, answer); err != nil {
			if !errors.Is(err, ErrVariablePattern) {
				return "", err
			}

			_, _ = fmt.Fprintf(stderr, "  Error: value %q does not match pattern %s. Try again.\n", answer, variable.Pattern)

			continue
		}

		return answer, nil
	}

	return "", &MissingVariableError{
		Name: variable.Name,
		Err:  fmt.Errorf("no valid answer after %d attempts", maxPromptAttempts),
	}
}

// SubstituteInPath replaces {{.name}} in each "/"-separated segment of a
// relative path. An unresolved placeholder is written back as {{.name}},
// without the spaces it may have had, as the TypeScript kit does for paths.
func SubstituteInPath(relativePath string, vars map[string]string) string {
	segments := strings.Split(relativePath, "/")

	for i, segment := range segments {
		segments[i] = varPattern.ReplaceAllStringFunc(segment, func(match string) string {
			name := varPattern.FindStringSubmatch(match)[1]
			if value, ok := vars[name]; ok {
				return value
			}

			return "{{." + name + "}}"
		})
	}

	return strings.Join(segments, "/")
}

// PrintVariablesApplied writes the resolved variables to w, one
// "  name = value" line each under "Variables applied:", sorted by name.
// It writes nothing when there are none.
func PrintVariablesApplied(w io.Writer, vars map[string]string) {
	if len(vars) == 0 {
		return
	}

	names := make([]string, 0, len(vars))
	for name := range vars {
		names = append(names, name)
	}

	sort.Strings(names)

	_, _ = fmt.Fprintln(w, "Variables applied:")

	for _, name := range names {
		_, _ = fmt.Fprintf(w, "  %s = %s\n", name, vars[name])
	}
}

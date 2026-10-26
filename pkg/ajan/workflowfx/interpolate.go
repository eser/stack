// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"fmt"
	"regexp"
	"strings"
)

// exprPattern matches ${{ expr }} sigils. Backlash-escaped \${{ is handled separately.
var exprPattern = regexp.MustCompile(`\$\{\{(.+?)\}\}`)

// escapedSigil is a placeholder used internally to protect \${{ from substitution.
const escapedSigil = "\x00_ESC_\x00"

// InterpolateOptions deep-walks opts and resolves any ${{ expr }} values using env.
//
// Rules:
//   - Full-value expression: the entire string is "${{ expr }}" → evaluates to any type.
//   - Embedded expression: "${{ expr }}" appears within a larger string → stringified and concatenated.
//   - Escape: \${{ is left as a literal ${{ in the output.
//   - Nested maps and slices are recursed.
//   - Non-string values are passed through unchanged.
func InterpolateOptions(opts map[string]any, env map[string]any) (map[string]any, error) {
	result := make(map[string]any, len(opts))

	for k, v := range opts {
		interpolated, err := interpolateValue(v, env)
		if err != nil {
			return nil, fmt.Errorf("option %q: %w", k, err)
		}

		result[k] = interpolated
	}

	return result, nil
}

func interpolateValue(v any, env map[string]any) (any, error) {
	switch tv := v.(type) {
	case string:
		return interpolateString(tv, env)
	case map[string]any:
		return InterpolateOptions(tv, env)
	case []any:
		result := make([]any, len(tv))

		for i, item := range tv {
			interpolated, err := interpolateValue(item, env)
			if err != nil {
				return nil, fmt.Errorf("[%d]: %w", i, err)
			}

			result[i] = interpolated
		}

		return result, nil
	default:
		return v, nil
	}
}

func interpolateString(s string, env map[string]any) (any, error) {
	// Protect escaped sigils before running the regex.
	escaped := strings.ReplaceAll(s, `\${{`, escapedSigil)

	locs := exprPattern.FindAllStringIndex(escaped, -1)
	if len(locs) == 0 {
		// No expressions — restore any escaped sigils.
		return strings.ReplaceAll(escaped, escapedSigil, "${{"), nil
	}

	// Full-value: the entire string is a single ${{ expr }} with no surrounding text.
	if len(locs) == 1 && locs[0][0] == 0 && locs[0][1] == len(escaped) {
		inner := strings.TrimSpace(escaped[3 : len(escaped)-2])

		val, err := evalExprAny(inner, env)
		if err != nil {
			return nil, fmt.Errorf("expression %q: %w", inner, err)
		}

		return val, nil
	}

	// Embedded: one or more ${{ }} within a larger string → stringify each match.
	var sb strings.Builder

	pos := 0

	for _, loc := range locs {
		// Write literal text before this match.
		sb.WriteString(escaped[pos:loc[0]])

		inner := strings.TrimSpace(escaped[loc[0]+3 : loc[1]-2])

		val, err := evalExprAny(inner, env)
		if err != nil {
			return nil, fmt.Errorf("expression %q: %w", inner, err)
		}

		fmt.Fprintf(&sb, "%v", val)
		pos = loc[1]
	}

	// Trailing literal text.
	sb.WriteString(escaped[pos:])

	return strings.ReplaceAll(sb.String(), escapedSigil, "${{"), nil
}

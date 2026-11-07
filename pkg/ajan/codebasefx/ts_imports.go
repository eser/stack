// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import "strings"

// tsImport is one module specifier that a source file loads.
type tsImport struct {
	Specifier string
	Line      int
}

// extractTSImports returns the module specifiers src loads, read from the
// tokens of the shared lexer, so text in comments and string literals is never
// taken for an import: import and export-from declarations (type-only ones
// too), side-effect imports, dynamic imports, import types, require calls and
// import.meta.resolve calls.
//
// A template literal with substitutions yields its text up to the first ${,
// which is enough to place it in a package or directory. A specifier computed
// at run time, as in import(toUrl(path)), has no text to read.
func extractTSImports(src []byte) []tsImport {
	tokens := significantTokens(lexTS(src))

	var imports []tsImport

	for i, tok := range tokens {
		if tok.Kind != tsIdent || (i > 0 && isPunct(tokens[i-1], ".")) {
			continue
		}

		var specifier *tsToken

		switch tok.Text {
		case "import":
			specifier = specifierAfterImport(tokens, i)
		case "export":
			specifier = specifierAfterExport(tokens, i)
		case "require":
			specifier = callArgument(tokens, i)
		}

		if specifier != nil {
			imports = append(imports, tsImport{Specifier: specifierText(*specifier), Line: specifier.Line})
		}
	}

	return imports
}

// significantTokens drops the comments, which may sit anywhere in a statement.
func significantTokens(tokens []tsToken) []tsToken {
	significant := make([]tsToken, 0, len(tokens))

	for _, tok := range tokens {
		if tok.Kind != tsComment {
			significant = append(significant, tok)
		}
	}

	return significant
}

func isPunct(tok tsToken, text string) bool {
	return tok.Kind == tsPunct && tok.Text == text
}

// specifierAfterImport reads the specifier of the import keyword at tokens[i].
func specifierAfterImport(tokens []tsToken, i int) *tsToken {
	if i+1 >= len(tokens) {
		return nil
	}

	next := tokens[i+1]

	switch {
	case next.Kind == tsString:
		return &tokens[i+1]
	case isPunct(next, "("):
		return callArgument(tokens, i)
	case isPunct(next, "."):
		return importMetaResolveArgument(tokens, i)
	default:
		return specifierAfterClause(tokens, i+1)
	}
}

// importMetaResolveArgument reads the literal argument of an
// import.meta.resolve call whose import keyword is at tokens[i].
func importMetaResolveArgument(tokens []tsToken, i int) *tsToken {
	const resolveOffset = 4 // import . meta . resolve

	if i+resolveOffset >= len(tokens) || tokens[i+2].Text != "meta" ||
		!isPunct(tokens[i+3], ".") || tokens[i+resolveOffset].Text != "resolve" {
		return nil
	}

	return callArgument(tokens, i+resolveOffset)
}

// specifierAfterExport reads the specifier of an export-from declaration at
// tokens[i]. Any other export has none.
func specifierAfterExport(tokens []tsToken, i int) *tsToken {
	start := i + 1
	if start < len(tokens) && tokens[start].Kind == tsIdent && tokens[start].Text == "type" {
		start++
	}

	if start >= len(tokens) || (!isPunct(tokens[start], "{") && !isPunct(tokens[start], "*")) {
		return nil
	}

	return specifierAfterClause(tokens, start)
}

// specifierAfterClause walks an import or export clause (names, a namespace, a
// braced list) from tokens[start] up to `from "specifier"`. Any other token
// ends the walk, so an `import x = y.z` or a property named import yields
// nothing.
func specifierAfterClause(tokens []tsToken, start int) *tsToken {
	depth := 0

	for i := start; i < len(tokens); i++ {
		tok := tokens[i]

		switch {
		case isPunct(tok, "{"):
			depth++
		case isPunct(tok, "}"):
			depth--
		case depth > 0:
			continue
		case tok.Kind == tsIdent:
			if tok.Text == "from" && i+1 < len(tokens) && tokens[i+1].Kind == tsString {
				return &tokens[i+1]
			}
		case isPunct(tok, "*"), isPunct(tok, ","):
			continue
		default:
			return nil
		}
	}

	return nil
}

// callArgument returns the literal first argument of the call whose callee is
// at tokens[i], if it has one.
func callArgument(tokens []tsToken, i int) *tsToken {
	if i+2 >= len(tokens) || !isPunct(tokens[i+1], "(") {
		return nil
	}

	if arg := tokens[i+2]; arg.Kind == tsString || arg.Kind == tsTemplate {
		return &tokens[i+2]
	}

	return nil
}

// specifierText strips the delimiters of a string or template token.
func specifierText(tok tsToken) string {
	text := tok.Text
	if tok.Kind == tsTemplate {
		text = strings.TrimSuffix(strings.TrimPrefix(text, "`"), "${")

		return strings.TrimSuffix(text, "`")
	}

	return strings.Trim(text, `'"`)
}

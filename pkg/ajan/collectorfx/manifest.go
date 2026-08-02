// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package collectorfx

import (
	"strings"
)

// GenerateManifestSource generates a TypeScript manifest source string from
// a list of ManifestEntry values. The output follows the pattern used by
// Deno Fresh / @eserstack/collector: one import per file, plus an exported
// manifest object listing every named export.
//
// The generated source is not formatted. Callers that need canonical style
// should pipe the output through `deno fmt -` (or equivalent).
//
// Example output for a single entry {RelPath: "routes/index.ts", Exports: ["default", "config"]}:
//
//	import * as routes_index from "./routes/index.ts";
//
//	export const manifest = {
//	  exports: [
//	    { path: "./routes/index.ts", identifier: "routes_index", exports: ["default", "config"] },
//	  ],
//	} as const;
func GenerateManifestSource(entries []ManifestEntry) string {
	used := make(map[string]struct{}, len(entries))
	type resolved struct {
		entry      ManifestEntry
		identifier string
	}

	// First pass: resolve identifiers for all entries.
	items := make([]resolved, 0, len(entries))

	for _, e := range entries {
		ident := SpecifierToIdentifier(e.RelPath, used)
		items = append(items, resolved{entry: e, identifier: ident})
	}

	var b strings.Builder

	// Imports section.
	for _, item := range items {
		b.WriteString(`import * as `)
		b.WriteString(item.identifier)
		b.WriteString(` from "./`)
		b.WriteString(item.entry.RelPath)
		b.WriteString(`";`)
		b.WriteString("\n")
	}

	b.WriteString("\n")

	// Manifest export.
	b.WriteString("export const manifest = {\n")
	b.WriteString("  exports: [\n")

	for _, item := range items {
		b.WriteString(`    { path: "./`)
		b.WriteString(item.entry.RelPath)
		b.WriteString(`", identifier: "`)
		b.WriteString(item.identifier)
		b.WriteString(`"`)

		if len(item.entry.Exports) > 0 {
			b.WriteString(`, exports: [`)

			for i, exp := range item.entry.Exports {
				if i > 0 {
					b.WriteString(", ")
				}

				b.WriteString(`"`)
				b.WriteString(exp)
				b.WriteString(`"`)
			}

			b.WriteString(`]`)
		}

		b.WriteString(" },\n")
	}

	b.WriteString("  ],\n")
	b.WriteString("} as const;\n")

	return b.String()
}

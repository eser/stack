// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"strconv"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// diagrams is commands/diagrams.ts: scan, list, check and verify over the
// registry in .eser/diagrams.json.
func (l *lifecycleRun) diagrams(args []string) (int, error) { //nolint:cyclop,funlen // the subcommands of commands/diagrams.ts
	out := l.e.stdout
	root := l.projectRoot()
	prefix := l.prefixOf(root)

	sub := ""
	if len(args) > 0 {
		sub = args[0]
	}

	switch {
	case len(args) > 0 && sub == "scan":
		// The registry lives in .eser/; writing it into a project noskills
		// does not manage would make the folder look like one.
		if !noskillsfx.IsHookInitialized(root) {
			writeln(out, red("noskills is not initialized."), " Run: ", bold(prefix+" init"))

			return clifx.ExitFailure, nil
		}

		entries, err := noskillsfx.ScanDiagrams(root, l.e.now())
		if err != nil {
			return 0, err //nolint:wrapcheck // the message names the directory
		}

		registry := make([]any, len(entries))
		for i, entry := range entries {
			registry[i] = entry
		}

		if err := noskillsfx.WriteDiagramRegistry(root, registry); err != nil {
			return 0, err //nolint:wrapcheck // the message names the file
		}

		writeln(out, green("✔"), " Found "+strconv.Itoa(len(entries))+" diagram(s):")

		for _, entry := range entries {
			refs, _ := noskillsfx.FieldOf(entry, "referencedFiles")
			items, _ := refs.([]any)

			writeln(out, "  "+diagramLocation(entry)+" ", dim("["+field(entry, "type")+"]"),
				dim(" refs: "+strconv.Itoa(len(items))))
		}

		return clifx.ExitOK, nil
	case len(args) == 0 || sub == "list":
		registry := noskillsfx.ReadDiagramRegistry(root)
		if len(registry) == 0 {
			writeln(out, dim("No diagrams registered. Run: "+prefix+" diagrams scan"))

			return clifx.ExitOK, nil
		}

		writeln(out, bold(strconv.Itoa(len(registry))+" diagram(s):"))

		for _, entry := range registry {
			writeln(out, "  "+diagramLocation(entry)+" ", dim("["+field(entry, "type")+"]"), " refs: "+diagramRefs(entry))
			writeln(out, dim("    verified: "+noskillsfx.JSSlice(field(entry, "lastVerified"), 0, 10)))
		}

		return clifx.ExitOK, nil
	case sub == "check":
		state := noskillsfx.ReadHookState(root, l.warn)
		execution, _ := noskillsfx.FieldOf(state, "execution")
		files, _ := noskillsfx.FieldOf(execution, "modifiedFiles")
		items, _ := files.([]any)

		var modified []string

		for _, item := range items {
			if file, ok := item.(string); ok {
				modified = append(modified, file)
			}
		}

		stale := noskillsfx.CheckDiagramStaleness(root, modified)
		if len(stale) == 0 {
			writeln(out, green("✔"), " No stale diagrams.")

			return clifx.ExitOK, nil
		}

		writeln(out, yellow("⚠ "+strconv.Itoa(len(stale))+" potentially stale diagram(s):"))

		for _, s := range stale {
			writeln(out, "  "+noskillsfx.JSString(s.File, true)+":"+noskillsfx.JSString(s.Line, true)+" ",
				dim("["+noskillsfx.JSString(s.Type, true)+"]"))
			writeln(out, dim("    "+s.Reason))
		}

		return clifx.ExitOK, nil
	case sub == "verify":
		return l.diagramsVerify(root, prefix, args)
	}

	writeln(out, red("Unknown subcommand. Use: scan, list, check, verify"))

	return clifx.ExitFailure, nil
}

func (l *lifecycleRun) diagramsVerify(root, prefix string, args []string) (int, error) {
	out := l.e.stdout

	file := ""
	if len(args) > 1 {
		file = args[1]
	}

	if file == "" {
		writeln(out, red("Usage: "+prefix+" diagrams verify <file>"))

		return clifx.ExitFailure, nil
	}

	line, hasLine, lineOK := 0, false, false

	for _, arg := range args {
		if value, found := strings.CutPrefix(arg, "--line="); found {
			hasLine = true
			line, lineOK = noskillsfx.JSParseInt(value)
		}
	}

	verified, err := noskillsfx.VerifyDiagram(root, file, line, hasLine, lineOK, l.e.now())
	if err != nil {
		return 0, err //nolint:wrapcheck // the message names the file
	}

	if verified {
		writeln(out, green("✔"), " Verified: "+file)
	} else {
		writeln(out, red("Diagram not found in registry: "+file))
	}

	return clifx.ExitOK, nil
}

// field is a registry entry's field as a template literal prints it.
func field(entry any, key string) string {
	value, present := noskillsfx.FieldOf(entry, key)

	return noskillsfx.JSString(value, present)
}

func diagramLocation(entry any) string {
	return field(entry, "file") + ":" + field(entry, "line")
}

// diagramRefs is the list's refs column: "none", or the names joined as
// Array.prototype.join does.
func diagramRefs(entry any) string {
	value, _ := noskillsfx.FieldOf(entry, "referencedFiles")
	items, _ := value.([]any)

	if len(items) == 0 {
		return "none"
	}

	parts := make([]string, len(items))

	for i, item := range items {
		if item != nil {
			parts[i] = noskillsfx.JSString(item, true)
		}
	}

	return strings.Join(parts, ", ")
}

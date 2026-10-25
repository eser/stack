// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// The built-in packs are copies of pkg/@eserstack/noskills/defaults/packs,
// file for file and byte for byte, with snake_case names.
func TestEmbeddedPacksMatchTheTypeScriptDefaults(t *testing.T) {
	t.Parallel()

	tsDir := filepath.Join("..", "..", "@eserstack", "noskills", "defaults", "packs")

	var tsFiles []string

	err := filepath.WalkDir(tsDir, func(p string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || entry.Name() == "mod.ts" {
			return err
		}

		rel, _ := filepath.Rel(tsDir, p)
		tsFiles = append(tsFiles, filepath.ToSlash(rel))

		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	var embedded []string

	err = fs.WalkDir(defaultPackFiles, "defaults/packs", func(p string, entry fs.DirEntry, err error) error {
		if err == nil && !entry.IsDir() {
			embedded = append(embedded, strings.TrimPrefix(p, "defaults/packs/"))
		}

		return err
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(tsFiles) == 0 || len(tsFiles) != len(embedded) {
		t.Fatalf("%d TypeScript pack files, %d embedded", len(tsFiles), len(embedded))
	}

	for _, rel := range tsFiles {
		want := readTestFile(t, filepath.Join(tsDir, filepath.FromSlash(rel)))

		got, err := defaultPackFiles.ReadFile(path.Join("defaults/packs", embeddedName(rel)))
		if err != nil {
			t.Errorf("%s has no embedded copy: %v", rel, err)

			continue
		}

		if string(got) != want {
			t.Errorf("defaults/packs/%s differs from the TypeScript file; copy it again", embeddedName(rel))
		}
	}
}

// The TypeScript packs embed their rule texts as constants in mod.ts; the Go
// packs read the .md files, so each file's text must be the constant.
func TestPackRulesMatchTheTypeScriptConstants(t *testing.T) {
	t.Parallel()

	modTS, err := os.ReadFile(filepath.Join("..", "..", "@eserstack", "noskills", "defaults", "packs", "mod.ts"))
	if err != nil {
		t.Fatal(err)
	}

	packs, err := BuiltinPacks()
	if err != nil {
		t.Fatal(err)
	}

	names := make([]string, len(packs))

	for i, pack := range packs {
		names[i] = pack.Name

		if len(pack.RuleNames) != 3 {
			t.Errorf("%s has %d rules", pack.Name, len(pack.RuleNames))
		}

		for _, rule := range pack.RuleNames {
			entry := jsonStringify(rule) + ":"
			text := jsonStringify(pack.RuleContents[rule])

			if !strings.Contains(string(modTS), text) || !strings.Contains(string(modTS), strings.Trim(entry, `"`)) {
				t.Errorf("mod.ts has no rule %s with the text %s", rule, text)
			}
		}
	}

	if !slices.Equal(names, []string{"typescript", "react", "security"}) {
		t.Errorf("packs %v", names)
	}
}

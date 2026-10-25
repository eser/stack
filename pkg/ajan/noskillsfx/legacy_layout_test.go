// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func seedLegacyEvents(t *testing.T) string {
	t.Helper()

	root := t.TempDir()
	for path, content := range map[string]string{
		".eser/.state/state.json":    `{"phase":"IDLE","spec":null}`,
		".eser/.events/events.jsonl": "{}\n",
	} {
		full := filepath.Join(root, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
			t.Fatal(err)
		}

		if err := os.WriteFile(full, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	return root
}

// TASK-329: a legacy events folder beside a new one that holds files failed
// with ENOTEMPTY after the progresses had already moved.
func TestMigrateLegacyLayout_RefusesAFullNewFolder(t *testing.T) {
	t.Parallel()

	root := seedLegacyEvents(t)
	newEvents := filepath.Join(root, ".eser", ".state", "events")
	if err := os.MkdirAll(newEvents, 0o750); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(newEvents, "new.jsonl"), []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := MigrateLegacyLayout(root, nil)

	partial, ok := errors.AsType[*PartialMigrationError](err)
	if !ok {
		t.Fatalf("err = %v, want a PartialMigrationError", err)
	}

	if !strings.Contains(partial.Error(), "/.eser/.events (dir) and ") {
		t.Errorf("message %q", partial.Error())
	}

	if !isRegularFile(filepath.Join(root, ".eser", ".state", "state.json")) {
		t.Error("the legacy state moved before the refusal")
	}
}

func TestMigrateLegacyLayout_ReplacesAnEmptyNewFolder(t *testing.T) {
	t.Parallel()

	root := seedLegacyEvents(t)
	if err := os.MkdirAll(filepath.Join(root, ".eser", ".state", "events"), 0o750); err != nil {
		t.Fatal(err)
	}

	moved, err := MigrateLegacyLayout(root, nil)
	if err != nil || !moved {
		t.Fatalf("moved %v, err %v", moved, err)
	}

	if !isRegularFile(filepath.Join(root, ".eser", ".state", "events", "events.jsonl")) {
		t.Error("the legacy events did not move")
	}
}

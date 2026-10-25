// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !wasip1

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestBridgeWorkflowRun_ManifestDryRunAndValidators(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("no final newline"), 0o600); err != nil {
		t.Fatal(err)
	}

	manifest := `workflows:
  - id: ci
    on: [precommit]
    steps:
      - shell:
          name: fmt
          command: "true"
          fixCommand: touch fixed.txt
      - validate-eof:
          continueOnError: true
`

	request, err := json.Marshal(map[string]any{
		"event": "precommit", "root": root, "manifest": manifest, "fix": true, "dryRun": true,
	})
	if err != nil {
		t.Fatal(err)
	}

	var resp workflowRunResponse
	if err := json.Unmarshal([]byte(bridgeWorkflowRun(string(request))), &resp); err != nil {
		t.Fatal(err)
	}

	if resp.Error != "" || len(resp.Results) != 1 {
		t.Fatalf("response %+v", resp)
	}

	result := resp.Results[0]
	if result.ID != "ci" || result.WorkflowID != "ci" || len(result.Steps) != 2 {
		t.Fatalf("result %+v", result)
	}

	if result.Steps[0].Name != "fmt" || !result.Steps[0].Passed {
		t.Errorf("the shell step: %+v", result.Steps[0])
	}

	if _, err := os.Stat(filepath.Join(root, "fixed.txt")); err == nil {
		t.Error("a dry run ran the fixCommand")
	}

	if result.Steps[1].Name != "validate-eof" || result.Steps[1].Passed {
		t.Errorf("validate-eof should find the missing newline: %+v", result.Steps[1])
	}
}

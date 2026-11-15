// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build unix

package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBridgeWorkflowRunStopsOnCancel(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	manifest := `workflows:
  - id: slow
    on: [manual]
    steps:
      - shell:
          name: wait
          command: touch started && sleep 30
      - shell:
          name: after
          command: touch after
`

	request, err := json.Marshal(map[string]any{
		"workflowId": "slow", "root": root, "manifest": manifest, "requestId": "workflow-cancel-running",
	})
	if err != nil {
		t.Fatal(err)
	}

	answer := make(chan string, 1)

	go func() { answer <- bridgeWorkflowRun(string(request)) }()

	deadline := time.Now().Add(10 * time.Second)
	for {
		if _, err := os.Stat(filepath.Join(root, "started")); err == nil {
			break
		}

		if time.Now().After(deadline) {
			t.Fatal("the first step did not start")
		}

		time.Sleep(20 * time.Millisecond)
	}

	if !cancelAIRequest("workflow-cancel-running") {
		t.Fatal("cancelAIRequest found no running workflow")
	}

	select {
	case <-answer:
	case <-time.After(10 * time.Second):
		t.Fatal("workflowRun did not return after the cancel")
	}

	if _, err := os.Stat(filepath.Join(root, "after")); err == nil {
		t.Error("a step ran after the workflow was cancelled")
	}
}

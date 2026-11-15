// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build unix

package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestBridgeWorkflowRunStopsOnCancel(t *testing.T) {
	t.Parallel()

	root := t.TempDir()

	// The first step writes to a FIFO, so opening it for reading returns once
	// the step runs.
	if err := syscall.Mkfifo(filepath.Join(root, "started"), 0o600); err != nil {
		t.Fatal(err)
	}

	manifest := `workflows:
  - id: slow
    on: [manual]
    steps:
      - shell:
          name: wait
          command: echo started > started && sleep 30
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

	fifo, err := os.OpenInRoot(root, "started")
	if err != nil {
		t.Fatal(err)
	}

	if _, err := io.ReadAll(fifo); err != nil {
		t.Fatal(err)
	}

	_ = fifo.Close()

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

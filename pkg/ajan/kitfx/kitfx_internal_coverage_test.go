// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx

import "testing"

// These tests access unexported workflow tool types to cover their Description()
// methods, which are part of the workflowfx.WorkflowTool interface but only
// called when a registry enumerates tools (not during normal execution).

func TestKitFetchRegistryTool_Description(t *testing.T) {
	t.Parallel()

	tool := &kitFetchRegistryTool{}
	if tool.Description() == "" {
		t.Error("kitFetchRegistryTool.Description() must return a non-empty string")
	}
}

func TestKitResolveChainTool_Description(t *testing.T) {
	t.Parallel()

	tool := &kitResolveChainTool{}
	if tool.Description() == "" {
		t.Error("kitResolveChainTool.Description() must return a non-empty string")
	}
}

func TestKitApplyRecipeTool_Description(t *testing.T) {
	t.Parallel()

	tool := &kitApplyRecipeTool{}
	if tool.Description() == "" {
		t.Error("kitApplyRecipeTool.Description() must return a non-empty string")
	}
}

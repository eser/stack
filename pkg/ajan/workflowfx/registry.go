// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx

import (
	"fmt"
	"sort"
	"sync"
)

// Registry stores WorkflowTool implementations by name.
type Registry struct {
	tools map[string]WorkflowTool
	mu    sync.RWMutex
}

// NewRegistry creates an empty tool registry.
func NewRegistry() *Registry {
	return &Registry{
		tools: make(map[string]WorkflowTool),
		mu:    sync.RWMutex{},
	}
}

// Register adds a tool. Overwrites any existing tool with the same name.
func (r *Registry) Register(tool WorkflowTool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.tools[tool.Name()] = tool
}

// Unregister removes a tool by name.
func (r *Registry) Unregister(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	delete(r.tools, name)
}

// Get looks up a tool by name.
func (r *Registry) Get(name string) (WorkflowTool, bool) { //nolint:ireturn
	r.mu.RLock()
	defer r.mu.RUnlock()

	tool, ok := r.tools[name]

	return tool, ok
}

// Names returns a sorted list of registered tool names.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	names := make([]string, 0, len(r.tools))

	for name := range r.tools {
		names = append(names, name)
	}

	sort.Strings(names)

	return names
}

// MustGet returns a tool or panics if not found. Useful in test setup.
func (r *Registry) MustGet(name string) WorkflowTool { //nolint:ireturn
	tool, ok := r.Get(name)
	if !ok {
		panic(fmt.Sprintf("workflowfx: tool '%s' not registered", name))
	}

	return tool
}

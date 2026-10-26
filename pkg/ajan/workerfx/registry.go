package workerfx

import "sync"

// Registry collects worker runners for centralized status querying.
type Registry struct {
	mu      sync.RWMutex
	runners map[string]*Runner
}

// NewRegistry creates a new worker registry.
func NewRegistry() *Registry {
	return &Registry{
		mu:      sync.RWMutex{},
		runners: make(map[string]*Runner),
	}
}

// Register adds a runner to the registry, keyed by worker name.
func (r *Registry) Register(runner *Runner) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.runners[runner.worker.Name()] = runner
}

// List returns the status of all registered workers.
func (r *Registry) List() []WorkerStatus {
	r.mu.RLock()
	defer r.mu.RUnlock()

	statuses := make([]WorkerStatus, 0, len(r.runners))

	for _, runner := range r.runners {
		statuses = append(statuses, runner.Status())
	}

	return statuses
}

// Get returns a runner by worker name.
func (r *Registry) Get(name string) (*Runner, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	runner, ok := r.runners[name]

	return runner, ok
}

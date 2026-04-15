package processfx

import (
	"maps"
	"sync"
)

// SupervisorRegistry tracks all active supervisors for health monitoring.
type SupervisorRegistry struct {
	supervisors map[string]*Supervisor
	mux         sync.RWMutex
}

// NewSupervisorRegistry creates a new supervisor registry.
func NewSupervisorRegistry() *SupervisorRegistry {
	return &SupervisorRegistry{
		supervisors: make(map[string]*Supervisor),
		mux:         sync.RWMutex{},
	}
}

// Register adds a supervisor to the registry.
func (r *SupervisorRegistry) Register(supervisor *Supervisor) {
	r.mux.Lock()
	defer r.mux.Unlock()

	r.supervisors[supervisor.Name()] = supervisor
}

// Unregister removes a supervisor from the registry.
func (r *SupervisorRegistry) Unregister(name string) {
	r.mux.Lock()
	defer r.mux.Unlock()

	delete(r.supervisors, name)
}

// Get returns a supervisor by name, or nil if not found.
func (r *SupervisorRegistry) Get(name string) *Supervisor {
	r.mux.RLock()
	defer r.mux.RUnlock()

	return r.supervisors[name]
}

// All returns all registered supervisors.
// The returned map is a copy to prevent concurrent modification.
func (r *SupervisorRegistry) All() map[string]*Supervisor {
	r.mux.RLock()
	defer r.mux.RUnlock()

	result := make(map[string]*Supervisor, len(r.supervisors))
	maps.Copy(result, r.supervisors)

	return result
}

// AllStatuses returns the status of all registered supervisors.
func (r *SupervisorRegistry) AllStatuses() map[string]WorkerStatus {
	r.mux.RLock()
	defer r.mux.RUnlock()

	result := make(map[string]WorkerStatus, len(r.supervisors))
	for name, supervisor := range r.supervisors {
		result[name] = supervisor.Status()
	}

	return result
}

// IsHealthy returns true if all registered supervisors are healthy.
func (r *SupervisorRegistry) IsHealthy() bool {
	r.mux.RLock()
	defer r.mux.RUnlock()

	for _, supervisor := range r.supervisors {
		if !supervisor.IsHealthy() {
			return false
		}
	}

	return true
}

// HealthSummary returns a summary of worker health states.
type HealthSummary struct {
	Total       int
	Healthy     int
	Stuck       int
	Restarting  int
	Failed      int
	IsHealthy   bool
	Supervisors map[string]WorkerStatus
}

// Summary returns a summary of all supervisor health states.
func (r *SupervisorRegistry) Summary() HealthSummary {
	r.mux.RLock()
	defer r.mux.RUnlock()

	summary := HealthSummary{
		Total:       len(r.supervisors),
		Healthy:     0,
		Stuck:       0,
		Restarting:  0,
		Failed:      0,
		IsHealthy:   true,
		Supervisors: make(map[string]WorkerStatus, len(r.supervisors)),
	}

	for name, supervisor := range r.supervisors {
		status := supervisor.Status()
		summary.Supervisors[name] = status

		switch status.State {
		case WorkerStateIdle, WorkerStateRunning:
			summary.Healthy++
		case WorkerStateStuck:
			summary.Stuck++
			summary.IsHealthy = false
		case WorkerStateRestarting:
			summary.Restarting++
		case WorkerStateFailed:
			summary.Failed++
			summary.IsHealthy = false
		}
	}

	return summary
}

// Count returns the number of registered supervisors.
func (r *SupervisorRegistry) Count() int {
	r.mux.RLock()
	defer r.mux.RUnlock()

	return len(r.supervisors)
}

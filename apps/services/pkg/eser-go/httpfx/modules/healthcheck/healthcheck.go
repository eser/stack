package healthcheck

import (
	"net/http"
	"time"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/eser/stack/apps/services/pkg/eser-go/processfx"
)

// WorkerHealthStatus represents the health status of a single worker.
type WorkerHealthStatus struct {
	State          string    `json:"state"`
	LastHeartbeat  time.Time `json:"last_heartbeat"`
	RestartCount   int       `json:"restart_count"`
	TotalRestarts  int       `json:"total_restarts"`
	ItemsProcessed int64     `json:"items_processed"`
	Uptime         string    `json:"uptime,omitempty"`
	Error          string    `json:"error,omitempty"`
}

// HealthResponse represents the full health check response.
type HealthResponse struct {
	Status  string                        `json:"status"`
	Workers map[string]WorkerHealthStatus `json:"workers,omitempty"`
	Summary *HealthSummary                `json:"summary,omitempty"`
}

// HealthSummary provides aggregate worker health statistics.
type HealthSummary struct {
	Total      int `json:"total"`
	Healthy    int `json:"healthy"`
	Stuck      int `json:"stuck"`
	Restarting int `json:"restarting"`
	Failed     int `json:"failed"`
}

// supervisorRegistry holds the reference to the supervisor registry.
// This is set via SetSupervisorRegistry.
var supervisorRegistry *processfx.SupervisorRegistry //nolint:gochecknoglobals

// SetSupervisorRegistry sets the supervisor registry for health checks.
// This should be called during application initialization.
func SetSupervisorRegistry(registry *processfx.SupervisorRegistry) {
	supervisorRegistry = registry
}

func RegisterHTTPRoutes(routes *httpfx.Router, config *httpfx.Config) {
	if !config.HealthCheckEnabled {
		return
	}

	// Simple health check (backwards compatible).
	routes.
		Route("GET /health-check", func(ctx *httpfx.Context) httpfx.Result {
			return ctx.Results.Ok()
		}).
		HasSummary("Health Check").
		HasDescription("Simple health check endpoint").
		HasResponse(http.StatusNoContent)

	// Detailed health check with worker status.
	routes.
		Route("GET /health", func(ctx *httpfx.Context) httpfx.Result {
			return ctx.Results.JSON(buildHealthResponse())
		}).
		HasSummary("Detailed Health Check").
		HasDescription("Returns detailed health status including worker supervision state").
		HasResponse(http.StatusOK)
}

// buildHealthResponse constructs the health check response from the supervisor registry.
func buildHealthResponse() HealthResponse {
	response := HealthResponse{
		Status:  "healthy",
		Workers: make(map[string]WorkerHealthStatus),
		Summary: nil,
	}

	if supervisorRegistry == nil {
		return response
	}

	summary := supervisorRegistry.Summary()

	response.Status = deriveHealthStatus(summary)
	response.Workers = buildWorkerStatusMap(summary)
	response.Summary = &HealthSummary{
		Total:      summary.Total,
		Healthy:    summary.Healthy,
		Stuck:      summary.Stuck,
		Restarting: summary.Restarting,
		Failed:     summary.Failed,
	}

	return response
}

// deriveHealthStatus determines the overall health status string from the summary.
func deriveHealthStatus(summary processfx.HealthSummary) string {
	if summary.IsHealthy {
		return "healthy"
	}

	if summary.Failed > 0 {
		return "unhealthy"
	}

	return "degraded"
}

// buildWorkerStatusMap converts supervisor statuses into the API response format.
func buildWorkerStatusMap(
	summary processfx.HealthSummary,
) map[string]WorkerHealthStatus {
	workers := make(map[string]WorkerHealthStatus, len(summary.Supervisors))

	for name, status := range summary.Supervisors {
		workerHealth := WorkerHealthStatus{
			State:          status.State.String(),
			LastHeartbeat:  time.Time{},
			RestartCount:   status.RestartCount,
			TotalRestarts:  status.TotalRestarts,
			ItemsProcessed: status.ItemsProcessed,
			Uptime:         "",
			Error:          "",
		}

		if !status.LastHeartbeat.IsZero() {
			workerHealth.LastHeartbeat = status.LastHeartbeat
		}

		if !status.StartedAt.IsZero() {
			workerHealth.Uptime = status.Uptime().Round(time.Second).String()
		}

		if status.LastError != nil {
			workerHealth.Error = status.LastError.Error()
		}

		workers[name] = workerHealth
	}

	return workers
}

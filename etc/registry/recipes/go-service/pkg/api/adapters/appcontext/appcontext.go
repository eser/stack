// Package appcontext provides the composition root for the application.
// It wires together all adapters and business logic dependencies.
package appcontext

// AppContext holds all application-wide dependencies.
// Add fields as new adapters and services are introduced.
type AppContext struct {
	// Add dependencies here, e.g.:
	// DB     *sql.DB
	// Logger *slog.Logger
}

// New creates a new AppContext with all dependencies initialized.
func New() (*AppContext, error) {
	return &AppContext{}, nil
}

package connfx

// NewRegistryOption defines functional options for Registry.
type NewRegistryOption func(*Registry)

// WithLogger sets the logger for the registry.
func WithLogger(logger Logger) NewRegistryOption {
	return func(r *Registry) {
		r.logger = logger
	}
}

func WithDefaultFactories() NewRegistryOption {
	return func(r *Registry) { //nolint:varnamelen
		// adapter_sql.go
		r.RegisterFactory(NewSQLConnectionFactory("sqlite"))
		r.RegisterFactory(NewSQLConnectionFactory("postgres"))
		r.RegisterFactory(NewSQLConnectionFactory("mysql"))

		// adapter_pgx.go
		r.RegisterFactory(NewPgxConnectionFactory("pgx"))

		// adapter_http.go
		r.RegisterFactory(NewHTTPConnectionFactory("http"))
		r.RegisterFactory(NewHTTPConnectionFactory("https"))

		// adapter_redis.go
		r.RegisterFactory(NewRedisConnectionFactory("redis"))

		// adapter_amqp.go
		r.RegisterFactory(NewAMQPConnectionFactory("amqp"))

		// adapter_otlp.go
		r.RegisterFactory(NewOTLPConnectionFactory("otlp"))
	}
}

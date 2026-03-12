package logfx

type Config struct {
	Level string `conf:"level" default:"INFO"`

	DefaultLogger bool `conf:"default"    default:"false"`
	PrettyMode    bool `conf:"pretty"     default:"true"`
	AddSource     bool `conf:"add_source" default:"false"`

	NoNativeCollectorRegistration bool `conf:"no_native_collector_registration" default:"false"`
}

package logfx_test

import (
	"os"
	"testing"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/stretchr/testify/assert"
)

func TestRegisterLogger(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		config *logfx.Config
	}{
		{
			name: "ValidConfig",
			config: &logfx.Config{
				Level:                         "INFO",
				PrettyMode:                    true,
				AddSource:                     false,
				DefaultLogger:                 false,
				NoNativeCollectorRegistration: false,
			},
		},
		{
			name: "InvalidLogLevel",
			config: &logfx.Config{
				Level:                         "invalid",
				PrettyMode:                    true,
				AddSource:                     true,
				DefaultLogger:                 false,
				NoNativeCollectorRegistration: false,
			},
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			logger := logfx.NewLogger(
				logfx.WithWriter(os.Stdout),
				logfx.WithConfig(tt.config),
			)
			assert.NotNil(t, logger)
		})
	}
}

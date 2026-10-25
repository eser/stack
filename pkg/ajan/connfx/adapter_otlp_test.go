package connfx

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOTLPConnectionFactory_Transport(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		property any
		env      string
		want     string
		wantErr  bool
	}{
		{name: "http/protobuf by default", want: OTLPTransportHTTP},
		{name: "the property picks gRPC", property: "grpc", want: OTLPTransportGRPC},
		{name: "the environment picks gRPC", env: "grpc", want: OTLPTransportGRPC},
		{name: "the property wins over the environment", property: "http/protobuf", env: "grpc", want: OTLPTransportHTTP},
		{name: "http/json is refused", property: "http/json", wantErr: true},
		{name: "an unknown environment value is refused", env: "udp", wantErr: true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			factory := NewOTLPConnectionFactory("otlp")
			factory.getenv = func(key string) string {
				if key == OTLPTransportEnv {
					return tc.env
				}

				return ""
			}

			config := &ConfigTarget{Protocol: "otlp", DSN: "localhost:4318"}
			if tc.property != nil {
				config.Properties = map[string]any{"transport": tc.property}
			}

			conn, err := factory.CreateConnection(context.Background(), config)
			if tc.wantErr {
				require.Error(t, err)
				assert.True(t, errors.Is(err, ErrUnsupportedOTLPTransport), err)

				return
			}

			require.NoError(t, err)

			otlpConn, ok := conn.(*OTLPConnection)
			require.True(t, ok)
			t.Cleanup(func() { _ = otlpConn.Close(closeContext(t)) })

			assert.Equal(t, tc.want, otlpConn.GetTransport())
			assert.NotNil(t, otlpConn.GetLogExporter())
			assert.NotNil(t, otlpConn.GetMetricExporter())
			assert.NotNil(t, otlpConn.GetTraceExporter())

			resource, err := otlpConn.CreateResource("svc", "1.0.0", "test")
			require.NoError(t, err)
			assert.NotNil(t, resource)
			// The exporters were never reached; closing them may report it.
			t.Cleanup(func() { _ = resource.Close(closeContext(t)) })
		})
	}
}

// closeContext bounds a Close that would wait to flush to a collector that
// is not there.
func closeContext(t *testing.T) context.Context {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	t.Cleanup(cancel)

	return ctx
}

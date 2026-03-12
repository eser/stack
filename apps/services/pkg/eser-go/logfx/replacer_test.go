package logfx_test

import (
	"errors"
	"fmt"
	"log/slog"
	"runtime"
	"strings"
	"testing"

	"github.com/eser/stack/apps/services/pkg/eser-go/logfx"
	"github.com/stretchr/testify/assert"
)

var errTest = errors.New("test error")

type mockError struct {
	msg   string
	stack []uintptr
}

func (m *mockError) StackTrace() []uintptr {
	return m.stack
}

func (m *mockError) Error() string {
	return m.msg
}

func (m *mockError) Add(ptr uintptr) *mockError {
	m.stack = append(m.stack, ptr)

	return m
}

func TestReplacerGenerator(t *testing.T) { //nolint:funlen
	t.Parallel()

	tests := []struct {
		name       string
		prettyMode bool
		groups     []string
		attr       slog.Attr
		expected   slog.Attr
	}{
		{
			name:       "PrettyMode=true, Key=slog.TimeKey",
			prettyMode: true,
			groups:     make([]string, 0),
			attr:       slog.Attr{Key: slog.TimeKey}, //nolint:exhaustruct
			expected:   slog.Attr{},                  //nolint:exhaustruct
		},
		{
			name:       "PrettyMode=true, Key=slog.LevelKey",
			prettyMode: true,
			groups:     make([]string, 0),
			attr:       slog.Attr{Key: slog.LevelKey}, //nolint:exhaustruct
			expected:   slog.Attr{},                   //nolint:exhaustruct
		},
		{
			name:       "PrettyMode=true, Key=slog.MessageKey",
			prettyMode: true,
			groups:     make([]string, 0),
			attr:       slog.Attr{Key: slog.MessageKey}, //nolint:exhaustruct
			expected:   slog.Attr{},                     //nolint:exhaustruct
		},
		{
			name:       "PrettyMode=false, Key=slog.TimeKey",
			prettyMode: false,
			groups:     make([]string, 0),
			attr:       slog.Attr{Key: slog.TimeKey}, //nolint:exhaustruct
			expected:   slog.Attr{Key: slog.TimeKey}, //nolint:exhaustruct
		},
		{
			name:       "PrettyMode=false, Key=slog.LevelKey",
			prettyMode: false,
			groups:     make([]string, 0),
			attr:       slog.Attr{Key: slog.LevelKey}, //nolint:exhaustruct
			expected:   slog.Attr{Key: slog.LevelKey}, //nolint:exhaustruct
		},
		{
			name:       "PrettyMode=false, Key=slog.MessageKey",
			prettyMode: false,
			groups:     make([]string, 0),
			attr:       slog.Attr{Key: slog.MessageKey}, //nolint:exhaustruct
			expected:   slog.Attr{Key: slog.MessageKey}, //nolint:exhaustruct
		},
		{
			name:       "PrettyMode=false, Key=slog.TimeKey, Value=error",
			prettyMode: false,
			groups:     make([]string, 0),
			attr: slog.Attr{
				Key:   slog.TimeKey,
				Value: slog.AnyValue(errTest),
			},
			expected: slog.Attr{
				Key:   slog.TimeKey,
				Value: slog.GroupValue(slog.String("msg", "test error")),
			},
		},
		{
			name:       "PrettyMode=false, Key=slog.TimeKey, Value=error with StackTracer",
			prettyMode: false,
			groups:     make([]string, 0),
			attr: slog.Attr{
				Key:   slog.TimeKey,
				Value: slog.AnyValue(errTest),
			},
			expected: slog.Attr{
				Key:   slog.TimeKey,
				Value: slog.GroupValue(slog.String("msg", "test error")),
			},
		},
		{
			name:       "PrettyMode=false, Key=slog.TimeKey, Value=error with mockError",
			prettyMode: false,
			groups:     make([]string, 0),
			attr: slog.Attr{
				Key:   slog.TimeKey,
				Value: slog.AnyValue(&mockError{msg: "test error"}), //nolint:exhaustruct
			},
			expected: slog.Attr{
				Key: slog.TimeKey,
				Value: slog.GroupValue(
					slog.String("msg", "test error"),
					slog.Any("trace", make([]string, 0)),
				),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := logfx.ReplacerGenerator(tt.prettyMode)(tt.groups, tt.attr)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestTraceLines(t *testing.T) { //nolint:funlen
	t.Parallel()

	stackGenerator := func() []uintptr {
		var pc [32]uintptr

		n := runtime.Callers(0, pc[:])

		return pc[:n]
	}

	stackGeneratorWithUnknownFunctionAddr := func() []uintptr {
		var pc [32]uintptr

		n := runtime.Callers(0, pc[:])
		pc[0] = 0

		return pc[:n]
	}

	pwd := func() string {
		_, file, _, _ := runtime.Caller(0)

		return file
	}

	tests := []struct {
		name     string
		stack    []uintptr
		expected []string
	}{
		{
			name:     "Empty Stack",
			stack:    make([]uintptr, 0),
			expected: make([]string, 0),
		},
		{
			name:  "Non-Empty Stack",
			stack: stackGenerator(),
			expected: []string{
				"runtime.Callers /usr/local/go/src/runtime/extern.go:331",
				fmt.Sprint(
					"github.com/eser/stack/apps/services/pkg/eser-go/logfx_test.TestTraceLines.func1 ",
					pwd(),
					":117",
				),
				fmt.Sprint(
					"github.com/eser/stack/apps/services/pkg/eser-go/logfx_test.TestTraceLines ",
					pwd(),
					":145",
				),
				"testing.tRunner /usr/local/go/src/testing/testing.go:1690",
			},
		},
		{
			name:  "Non-Empty Stack with Unknown Function Address",
			stack: stackGeneratorWithUnknownFunctionAddr(),
			expected: []string{
				"unknown",
				fmt.Sprint(
					"github.com/eser/stack/apps/services/pkg/eser-go/logfx_test.TestTraceLines ",
					pwd(),
					":147",
				),
			},
		},
	}

	for _, tt := range tests { //nolint:varnamelen
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			result := logfx.TraceLines(tt.stack)

			if len(tt.expected) == 0 {
				assert.Equal(t, tt.expected, result)

				return
			}

			for i := range tt.expected {
				ext := strings.Split(tt.expected[i], " ")

				assert.Contains(t, result[i], ext[0])
			}
		})
	}
}

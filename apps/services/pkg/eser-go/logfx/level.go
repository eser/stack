package logfx

import (
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
)

var (
	ErrInvalidLevelString = errors.New("invalid level string")
	ErrUnknownErrorLevel  = errors.New("unknown error level")
)

// OtelLevel - 9 = Level.
const (
	LevelTrace slog.Level = slog.Level(-8)
	LevelDebug slog.Level = slog.LevelDebug
	LevelInfo  slog.Level = slog.LevelInfo
	LevelWarn  slog.Level = slog.LevelWarn
	LevelError slog.Level = slog.LevelError
	LevelFatal slog.Level = slog.Level(12)
	LevelPanic slog.Level = slog.Level(16)
)

const DefaultLogLevel = "INFO"

func LevelEncoder(l slog.Level) string { //nolint:varnamelen
	str := func(base string, val slog.Level) string {
		if val == 0 {
			return base
		}

		return fmt.Sprintf("%s%+d", base, val)
	}

	switch {
	case l < LevelDebug:
		return str("TRACE", l-LevelTrace)

	case l < LevelInfo:
		return str("DEBUG", l-LevelDebug)

	case l < LevelWarn:
		return str("INFO", l-LevelInfo)

	case l < LevelError:
		return str("WARN", l-LevelWarn)

	case l < LevelFatal:
		return str("ERROR", l-LevelError)

	case l < LevelPanic:
		return str("FATAL", l-LevelFatal)

	default:
		return str("PANIC", l-LevelPanic)
	}
}

func LevelEncoderColored(l slog.Level) string { //nolint:varnamelen
	str := func(base string, val slog.Level) string {
		if val == 0 {
			return base
		}

		return fmt.Sprintf("%s%+d", base, val)
	}

	switch {
	case l < LevelDebug:
		return Colored(ColorLightBlue, str("TRACE", l-LevelTrace))

	case l < LevelInfo:
		return Colored(ColorLightBlue, str("DEBUG", l-LevelDebug))

	case l < LevelWarn:
		return Colored(ColorGreen, str("INFO", l-LevelInfo))

	case l < LevelError:
		return Colored(ColorYellow, str("WARN", l-LevelWarn))

	case l < LevelFatal:
		return Colored(ColorRed, str("ERROR", l-LevelError))

	case l < LevelPanic:
		return Colored(ColorRed, str("FATAL", l-LevelFatal))

	default:
		return Colored(ColorRed, str("PANIC", l-LevelPanic))
	}
}

func ParseLevel(s string, errorOnEmpty bool) (*slog.Level, error) { //nolint:cyclop,varnamelen
	var l slog.Level //nolint:varnamelen

	var err error

	if s == "" && !errorOnEmpty {
		return &l, nil
	}

	name := s
	offset := 0

	if i := strings.IndexAny(s, "+-"); i >= 0 {
		name = s[:i]

		offset, err = strconv.Atoi(s[i:])
		if err != nil {
			return nil, fmt.Errorf("%w (s=%q): %w", ErrInvalidLevelString, s, err)
		}
	}

	switch strings.ToUpper(name) {
	case "TRACE":
		l = LevelTrace
	case "DEBUG":
		l = LevelDebug
	case "INFO":
		l = LevelInfo
	case "WARN":
		l = LevelWarn
	case "ERROR":
		l = LevelError
	case "FATAL":
		l = LevelFatal
	case "PANIC":
		l = LevelPanic
	default:
		return nil, fmt.Errorf("%w (s=%q)", ErrUnknownErrorLevel, s)
	}

	l += slog.Level(offset)

	return &l, nil
}

package httpfx

import "sync/atomic"

// DefaultMaxRequestBodyBytes bounds a request body when nothing has configured
// a limit. It matches the 50 MB default of Config.MaxRequestSizeMB, so a server
// that never calls SetMaxRequestBodyBytes behaves as the documented default
// rather than as "unlimited".
const DefaultMaxRequestBodyBytes int64 = 50 << 20

// Stored as atomic because it is read on every request-parsing goroutine and
// written once at service construction; a plain variable is a data race under
// the race detector even though the value is only set at startup.
var configuredMaxRequestBodyBytes atomic.Int64

// SetMaxRequestBodyBytes sets the ceiling ParseJSONBody enforces.
//
// A value of zero or less restores the default. It deliberately cannot express
// "unlimited": MaxRequestSizeMB previously had no effect at all, and the failure
// mode of an accidental zero should be the documented default rather than the
// unbounded read that this exists to prevent.
func SetMaxRequestBodyBytes(limit int64) {
	if limit <= 0 {
		configuredMaxRequestBodyBytes.Store(0)

		return
	}

	configuredMaxRequestBodyBytes.Store(limit)
}

// MaxRequestBodyBytes reports the ceiling currently in force.
func MaxRequestBodyBytes() int64 {
	return maxRequestBodyBytes()
}

func maxRequestBodyBytes() int64 {
	if limit := configuredMaxRequestBodyBytes.Load(); limit > 0 {
		return limit
	}

	return DefaultMaxRequestBodyBytes
}

// applyConfigPolicies connects the Config fields that govern package-level
// behaviour, called from both service constructors.
//
// MaxRequestSizeMB and ExposeInternalErrors were declared, documented, and
// never read by anything -- a repo-wide grep returned only their declarations,
// while the project's own security guidance instructs operators to set them.
// Wiring them here is what makes that guidance true.
func applyConfigPolicies(config *Config) {
	if config == nil {
		return
	}

	if config.MaxRequestSizeMB > 0 {
		SetMaxRequestBodyBytes(config.MaxRequestSizeMB << 20)
	}

	SetDiscloseErrors(config.ExposeInternalErrors)
}

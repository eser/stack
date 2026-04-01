package main

import (
	"sync"
)

// Version is the current version of the eser-ajan library.
// Injected at build time via: go build -ldflags "-X main.Version=4.1.44"
// Falls back to "dev" if not set.
var Version = "dev"

var (
	initialized bool
	mu          sync.Mutex
)

// bridgeVersion returns the version string.
func bridgeVersion() string {
	return "eser-ajan version " + Version
}

// bridgeInit initializes the Go runtime bridge.
// Returns 0 on success.
func bridgeInit() int {
	mu.Lock()
	defer mu.Unlock()

	initialized = true

	return 0
}

// bridgeShutdown cleans up the Go runtime bridge.
func bridgeShutdown() {
	mu.Lock()
	defer mu.Unlock()

	initialized = false
}

// bridgeConfigLoad is a stub for future ajan bridge config loading.
func bridgeConfigLoad(_ string) string {
	return "{}"
}

// bridgeDIResolve is a stub for future ajan bridge DI resolution.
func bridgeDIResolve(_ string) string {
	return "null"
}

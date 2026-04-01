package main

import (
	"strings"
	"testing"
)

func TestBridgeVersion(t *testing.T) {
	t.Run("returns version string", func(t *testing.T) {
		got := bridgeVersion()
		want := "eser-ajan version " + Version

		if got != want {
			t.Errorf("bridgeVersion() = %q, want %q", got, want)
		}
	})

	t.Run("contains version constant", func(t *testing.T) {
		got := bridgeVersion()

		if !strings.Contains(got, Version) {
			t.Errorf("bridgeVersion() = %q, does not contain Version %q", got, Version)
		}
	})
}

func TestBridgeInit(t *testing.T) {
	t.Run("returns zero on success", func(t *testing.T) {
		got := bridgeInit()
		if got != 0 {
			t.Errorf("bridgeInit() = %d, want 0", got)
		}
	})

	t.Run("idempotent calls succeed", func(t *testing.T) {
		got := bridgeInit()
		if got != 0 {
			t.Errorf("second bridgeInit() = %d, want 0", got)
		}

		bridgeShutdown()
	})
}

func TestBridgeShutdown(t *testing.T) {
	t.Run("does not panic", func(t *testing.T) {
		bridgeInit()
		bridgeShutdown()
	})
}

func TestEserAjanFree(t *testing.T) {
	t.Run("does not panic on nil", func(t *testing.T) {
		EserAjanFree(nil)
	})
}

func TestBridgeConfigLoad(t *testing.T) {
	t.Run("returns empty JSON object", func(t *testing.T) {
		got := bridgeConfigLoad("/some/path")
		if got != "{}" {
			t.Errorf("bridgeConfigLoad() = %q, want %q", got, "{}")
		}
	})
}

func TestBridgeDIResolve(t *testing.T) {
	t.Run("returns null string", func(t *testing.T) {
		got := bridgeDIResolve("SomeService")
		if got != "null" {
			t.Errorf("bridgeDIResolve() = %q, want %q", got, "null")
		}
	})
}

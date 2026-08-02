// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package httpfx_test

import (
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
)

func TestHTTPService_Router(t *testing.T) {
	t.Parallel()

	config := &httpfx.Config{ //nolint:exhaustruct
		Addr:              ":9099",
		ReadHeaderTimeout: time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      5 * time.Second,
		IdleTimeout:       30 * time.Second,
	}
	router := httpfx.NewRouter("/")
	logger := logfx.NewLogger()
	service := httpfx.NewHTTPService(config, router, logger)

	got := service.Router()
	if got == nil {
		t.Fatal("expected non-nil Router from service.Router()")
	}
}

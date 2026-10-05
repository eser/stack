// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares_test

import (
	"io"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/eser/stack/pkg/ajan/logfx"
)

// newTestRouter returns a router whose log of failed writes is discarded.
func newTestRouter() *httpfx.Router {
	return httpfx.NewRouter(logfx.NewLogger(logfx.WithWriter(io.Discard)))
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package middlewares

import (
	"strings"

	"github.com/eser/stack/pkg/ajan/httpfx"
)

const contentSecurityPolicyHeader = "Content-Security-Policy"

// cspConfig holds Content Security Policy directive values.
type cspConfig struct {
	defaultSrc   []string
	scriptSrc    []string
	styleSrc     []string
	imgSrc       []string
	fontSrc      []string
	connectSrc   []string
	frameSrc     []string
	objectSrc    []string
	mediaSrc     []string
	workerSrc    []string
	manifestSrc  []string
	baseURI      []string
	formAction   []string
	frameAnc     []string
	upgradeInsec bool
	blockMixed   bool
}

// CspOption is a functional option for CspMiddleware.
type CspOption func(*cspConfig)

// WithCspDefaultSrc sets the default-src directive.
func WithCspDefaultSrc(srcs ...string) CspOption {
	return func(c *cspConfig) { c.defaultSrc = srcs }
}

// WithCspScriptSrc sets the script-src directive.
func WithCspScriptSrc(srcs ...string) CspOption {
	return func(c *cspConfig) { c.scriptSrc = srcs }
}

// WithCspStyleSrc sets the style-src directive.
func WithCspStyleSrc(srcs ...string) CspOption {
	return func(c *cspConfig) { c.styleSrc = srcs }
}

// WithCspImgSrc sets the img-src directive.
func WithCspImgSrc(srcs ...string) CspOption {
	return func(c *cspConfig) { c.imgSrc = srcs }
}

// WithCspFontSrc sets the font-src directive.
func WithCspFontSrc(srcs ...string) CspOption {
	return func(c *cspConfig) { c.fontSrc = srcs }
}

// WithCspConnectSrc sets the connect-src directive.
func WithCspConnectSrc(srcs ...string) CspOption {
	return func(c *cspConfig) { c.connectSrc = srcs }
}

// WithCspFrameSrc sets the frame-src directive.
func WithCspFrameSrc(srcs ...string) CspOption {
	return func(c *cspConfig) { c.frameSrc = srcs }
}

// WithCspObjectSrc sets the object-src directive.
func WithCspObjectSrc(srcs ...string) CspOption {
	return func(c *cspConfig) { c.objectSrc = srcs }
}

// WithCspBaseURI sets the base-uri directive.
func WithCspBaseURI(srcs ...string) CspOption {
	return func(c *cspConfig) { c.baseURI = srcs }
}

// WithCspFormAction sets the form-action directive.
func WithCspFormAction(srcs ...string) CspOption {
	return func(c *cspConfig) { c.formAction = srcs }
}

// WithCspFrameAncestors sets the frame-ancestors directive.
func WithCspFrameAncestors(srcs ...string) CspOption {
	return func(c *cspConfig) { c.frameAnc = srcs }
}

// WithCspUpgradeInsecureRequests adds the upgrade-insecure-requests directive.
func WithCspUpgradeInsecureRequests() CspOption {
	return func(c *cspConfig) { c.upgradeInsec = true }
}

// WithCspBlockAllMixedContent adds the block-all-mixed-content directive.
func WithCspBlockAllMixedContent() CspOption {
	return func(c *cspConfig) { c.blockMixed = true }
}

func buildCSP(cfg *cspConfig) string {
	var parts []string

	add := func(directive string, srcs []string) {
		if len(srcs) > 0 {
			parts = append(parts, directive+" "+strings.Join(srcs, " "))
		}
	}

	add("default-src", cfg.defaultSrc)
	add("script-src", cfg.scriptSrc)
	add("style-src", cfg.styleSrc)
	add("img-src", cfg.imgSrc)
	add("font-src", cfg.fontSrc)
	add("connect-src", cfg.connectSrc)
	add("frame-src", cfg.frameSrc)
	add("object-src", cfg.objectSrc)
	add("media-src", cfg.mediaSrc)
	add("worker-src", cfg.workerSrc)
	add("manifest-src", cfg.manifestSrc)
	add("base-uri", cfg.baseURI)
	add("form-action", cfg.formAction)
	add("frame-ancestors", cfg.frameAnc)

	if cfg.upgradeInsec {
		parts = append(parts, "upgrade-insecure-requests")
	}

	if cfg.blockMixed {
		parts = append(parts, "block-all-mixed-content")
	}

	return strings.Join(parts, "; ")
}

// CspMiddleware sets a Content-Security-Policy header on every response.
// With no options, it defaults to "default-src 'self'".
func CspMiddleware(options ...CspOption) httpfx.Handler {
	cfg := &cspConfig{
		defaultSrc: []string{"'self'"},
	}

	for _, opt := range options {
		opt(cfg)
	}

	policy := buildCSP(cfg)

	return func(ctx *httpfx.Context) httpfx.Result {
		ctx.ResponseWriter.Header().Set(contentSecurityPolicyHeader, policy)

		return ctx.Next()
	}
}

// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package streamfx provides a composable stream-processing pipeline built on
// Go channels and goroutines.
//
// The pipeline model mirrors the @eserstack/streams TypeScript package:
//
//	pipeline := streamfx.New().
//	    From(streamfx.ValuesSource("input", items...)).
//	    Through(streamfx.FilterLayer("filter", pred)).
//	    To(streamfx.StdoutSink("output"))
//	err := pipeline.Run(ctx, nil)
//
// Each stage runs as a goroutine. Context cancellation stops all goroutines.
package streamfx

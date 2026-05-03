// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

//go:build !windows && !wasip1

package tui

import (
	"context"
	"os"
	"os/signal"
	"syscall"
)

// startSIGWINCH starts a goroutine that listens for SIGWINCH (terminal resize)
// and emits a "resize" KeypressEvent with the new dimensions.
func (kr *KeypressReader) startSIGWINCH(ctx context.Context) {
	kr.wg.Add(1)

	go func() {
		defer kr.wg.Done()

		ch := make(chan os.Signal, 1)
		signal.Notify(ch, syscall.SIGWINCH)
		defer signal.Stop(ch)

		for {
			select {
			case <-ch:
				size, err := GetTerminalSize()
				if err != nil {
					continue
				}

				ev := KeypressEvent{Name: "resize", Cols: size.Cols, Rows: size.Rows}

				select {
				case kr.events <- ev:
				case <-ctx.Done():
					return
				}

			case <-ctx.Done():
				return
			}
		}
	}()
}

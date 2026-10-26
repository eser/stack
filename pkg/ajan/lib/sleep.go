package lib

import (
	"context"
	"time"
)

func SleepContext(ctx context.Context, delay time.Duration) {
	select {
	case <-ctx.Done():
	case <-time.After(delay):
	}
}

func SleepUntilContext(ctx context.Context, targetTime time.Time) {
	select {
	case <-ctx.Done():
	case <-time.After(time.Until(targetTime)):
	}
}

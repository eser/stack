package main

import (
	"context"
	"log"

	"github.com/eser/stack/apps/services/pkg/api/adapters/appcontext"
)

func main() {
	ctx := context.Background()

	appCtx, err := appcontext.New(ctx)
	if err != nil {
		log.Fatalf("failed to initialize application: %v", err)
	}

	appCtx.Process.Wait()
}

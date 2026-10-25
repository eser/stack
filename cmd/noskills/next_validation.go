// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/eser/stack/pkg/ajan/aifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The validator of `next --validate` and the manifest's `validate` entry
// (TASK-164) runs on aifx, as resolveAiFactory in commands/next-validation.ts
// runs it on @eserstack/ai: the agent names one of its providers, and the
// model gets the system prompt, the input as one JSON document and the
// reply's JSON Schema.

// validatorFactories finds the aifx provider an agent names, or nil.
type validatorFactories func(agent string) aifx.ProviderFactory

// The generation defaults @eserstack/ai applies to a model it adds
// (config.ts withDefaults).
const (
	validatorMaxTokens   = 16_000
	validatorTemperature = 0.7
)

// systemValidatorFactories are the providers a `validate.agent` can name:
// the ones @eserstack/ai's factoryFor knows.
func systemValidatorFactories(agent string) aifx.ProviderFactory { //nolint:ireturn // the aifx interface
	switch agent {
	case "claude-code":
		return aifx.NewClaudeCodeModelFactory()
	case "kiro":
		return aifx.NewKiroModelFactory()
	case "opencode":
		return aifx.NewOpenCodeModelFactory()
	case "anthropic":
		return aifx.NewAnthropicModelFactory()
	case "openai":
		return aifx.NewOpenAIModelFactory()
	case "gemini":
		return aifx.NewGeminiModelFactory()
	case "vertexai":
		return aifx.NewVertexAIModelFactory()
	case "ollama":
		return aifx.NewOllamaModelFactory()
	default:
		return nil
	}
}

// validatorResolver is the judge lookup `next` gets.
func validatorResolver(e *env) noskillsfx.ValidatorResolver {
	factories := e.validators
	if factories == nil {
		factories = systemValidatorFactories
	}

	return func(agent string) noskillsfx.ValidationJudge {
		factory := factories(agent)
		if factory == nil {
			return nil
		}

		return &aifxJudge{factory: factory}
	}
}

// aifxJudge runs the validator model on one aifx provider.
type aifxJudge struct {
	factory aifx.ProviderFactory
}

func (j *aifxJudge) Judge(ctx context.Context, request *noskillsfx.ValidationRequest) (string, error) {
	schema, err := json.Marshal(request.ReplySchema)
	if err != nil {
		return "", fmt.Errorf("encode the reply schema: %w", err)
	}

	timeout := noskillsfx.ValidationTimeout
	if deadline, ok := ctx.Deadline(); ok {
		timeout = time.Until(deadline)
	}

	model, err := j.factory.CreateModel(ctx, &aifx.ConfigTarget{ //nolint:exhaustruct
		Provider:       request.Settings.Agent,
		Model:          request.Settings.Model,
		MaxTokens:      validatorMaxTokens,
		Temperature:    validatorTemperature,
		RequestTimeout: timeout,
		// A CLI agent starts in an empty directory, away from the
		// project's files, rules and hooks.
		Properties: map[string]any{"cwd": request.WorkDir},
	})
	if err != nil {
		return "", err //nolint:wrapcheck // the skipped validation names the agent
	}

	// Closed with a context of its own: the call's may have ended.
	defer func() { _ = model.Close(context.WithoutCancel(ctx)) }()

	result, err := model.GenerateText(ctx, &aifx.GenerateTextOptions{ //nolint:exhaustruct
		System:   request.System,
		Messages: []aifx.Message{aifx.NewTextMessage(aifx.RoleUser, request.Prompt)},
		ResponseFormat: &aifx.ResponseFormat{
			Type:       "json_schema",
			Name:       "transition_validation",
			JSONSchema: schema,
		},
	})
	if err != nil {
		return "", &noskillsfx.ValidatorReplyError{Message: err.Error()}
	}

	if result.StopReason == aifx.StopReasonRefusal {
		return "", noskillsfx.ErrValidatorDeclined
	}

	return result.Text(), nil
}

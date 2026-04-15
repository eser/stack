package aifx

import (
	"context"
	"errors"
	"fmt"
)

// Sentinel errors for GetTypedClient function.
var (
	ErrRegistryIsNil  = errors.New("registry is nil")
	ErrRawClientIsNil = errors.New("raw client is nil")
	ErrInvalidType    = errors.New("invalid type")
)

// LanguageModel is the core interface for all AI model interactions.
type LanguageModel interface {
	// GetCapabilities returns the capabilities this model supports.
	GetCapabilities() []ProviderCapability

	// GetProvider returns the provider name (e.g., "anthropic", "openai").
	GetProvider() string

	// GetModelID returns the model identifier.
	GetModelID() string

	// GenerateText performs a non-streaming text generation.
	GenerateText(ctx context.Context, opts *GenerateTextOptions) (*GenerateTextResult, error)

	// StreamText performs a streaming text generation.
	StreamText(ctx context.Context, opts *StreamTextOptions) (*StreamIterator, error)

	// Close releases resources held by the model.
	Close(ctx context.Context) error

	// GetRawClient returns the underlying provider SDK client.
	GetRawClient() any
}

// BatchCapableModel is optionally implemented by models that support batch processing.
// Check with GetCapabilities() before casting.
type BatchCapableModel interface {
	LanguageModel

	// SubmitBatch submits a batch of generation requests.
	SubmitBatch(ctx context.Context, req *BatchRequest) (*BatchJob, error)

	// GetBatchJob retrieves the current status of a batch job.
	GetBatchJob(ctx context.Context, jobID string) (*BatchJob, error)

	// ListBatchJobs lists batch jobs.
	ListBatchJobs(ctx context.Context, opts *ListBatchOptions) ([]*BatchJob, error)

	// DownloadBatchResults downloads the results of a completed batch job.
	DownloadBatchResults(ctx context.Context, job *BatchJob) ([]*BatchResult, error)

	// CancelBatchJob cancels a running batch job.
	CancelBatchJob(ctx context.Context, jobID string) error
}

// ProviderFactory creates language models from configuration.
type ProviderFactory interface {
	// CreateModel creates a new language model from configuration.
	CreateModel(ctx context.Context, config *ConfigTarget) (LanguageModel, error)

	// GetProvider returns the provider name this factory supports.
	GetProvider() string
}

// GetTypedClient extracts a typed client from a LanguageModel interface.
// This provides type-safe access to the underlying provider SDK client.
//
// Example usage:
//
//	client, err := aifx.GetTypedClient[*anthropic.Client](registry, "default")
//	if err != nil { return err }
func GetTypedClient[T any](registry *Registry, name string) (T, error) { //nolint:ireturn
	var zero T

	if registry == nil {
		return zero, ErrRegistryIsNil
	}

	model := registry.GetNamed(name)
	if model == nil {
		return zero, ErrModelNotFound
	}

	raw := model.GetRawClient()
	if raw == nil {
		return zero, fmt.Errorf(
			"%w (provider=%q)",
			ErrRawClientIsNil,
			model.GetProvider(),
		)
	}

	typed, ok := raw.(T)
	if !ok {
		return zero, fmt.Errorf("%w (provider=%q, expected=%T, got=%T)",
			ErrInvalidType, model.GetProvider(), zero, raw)
	}

	return typed, nil
}

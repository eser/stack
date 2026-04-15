package aifx

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/genai"
)

// Sentinel errors for the Vertex AI adapter.
var (
	ErrVertexAIGenerationFailed = errors.New("vertexai generation failed")
	ErrVertexAIStreamFailed     = errors.New("vertexai stream failed")
	ErrVertexAIClientCreate     = errors.New("vertexai client creation failed")
	ErrVertexAIProjectMissing   = errors.New("vertexai project ID is required")
	ErrVertexAILocationMissing  = errors.New("vertexai location is required")
)

const vertexAIProviderName = "vertexai"

// classifyVertexAIError wraps err with the provider sentinel and, when the
// underlying error is a GenAI API error, inserts a provider-agnostic
// classification sentinel so callers can use errors.Is without importing the SDK.
func classifyVertexAIError(providerSentinel error, err error) error {
	ctxErr := classifyContextError(providerSentinel, err)
	if ctxErr != nil {
		return ctxErr
	}

	var apiErr genai.APIError
	if errors.As(err, &apiErr) {
		return classifyAndWrap(providerSentinel, apiErr.Code, err)
	}

	return fmt.Errorf("%w: %w", providerSentinel, err)
}

// vertexAICapabilities returns the capabilities supported by the Vertex AI adapter.
func vertexAICapabilities() []ProviderCapability {
	return []ProviderCapability{
		CapabilityTextGeneration,
		CapabilityStreaming,
		CapabilityToolCalling,
		CapabilityVision,
		CapabilityAudio,
		CapabilityStructuredOut,
		CapabilityReasoning,
	}
}

// vertexAIModelFactory creates Vertex AI language models.
type vertexAIModelFactory struct{}

// NewVertexAIModelFactory returns a new ProviderFactory for Google Vertex AI.
func NewVertexAIModelFactory() ProviderFactory { //nolint:ireturn
	return &vertexAIModelFactory{}
}

func (f *vertexAIModelFactory) GetProvider() string {
	return vertexAIProviderName
}

func (f *vertexAIModelFactory) CreateModel(
	ctx context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	if config.ProjectID == "" {
		return nil, fmt.Errorf("%w: %w", ErrVertexAIClientCreate, ErrVertexAIProjectMissing)
	}

	if config.Location == "" {
		return nil, fmt.Errorf("%w: %w", ErrVertexAIClientCreate, ErrVertexAILocationMissing)
	}

	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrVertexAIClientCreate, ErrInvalidModel)
	}

	clientConfig := &genai.ClientConfig{ //nolint:exhaustruct
		Backend:  genai.BackendVertexAI,
		Project:  config.ProjectID,
		Location: config.Location,
	}

	// Vertex AI uses application default credentials by default.
	// If an API key is explicitly provided, set it.
	if config.APIKey != "" {
		clientConfig.APIKey = config.APIKey
	}

	client, err := genai.NewClient(ctx, clientConfig)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrVertexAIClientCreate, err)
	}

	return &VertexAIModel{
		client:  client,
		modelID: config.Model,
	}, nil
}

// VertexAIModel implements LanguageModel for Google Vertex AI.
type VertexAIModel struct {
	client  *genai.Client
	modelID string
}

func (m *VertexAIModel) GetCapabilities() []ProviderCapability {
	return vertexAICapabilities()
}

func (m *VertexAIModel) GetProvider() string {
	return vertexAIProviderName
}

func (m *VertexAIModel) GetModelID() string {
	return m.modelID
}

func (m *VertexAIModel) GetRawClient() any {
	return m.client
}

func (m *VertexAIModel) Close(_ context.Context) error {
	// The genai client does not require explicit cleanup.
	return nil
}

// GenerateText performs a non-streaming text generation using the Vertex AI API.
func (m *VertexAIModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	config := buildGenerateContentConfig(opts)
	contents := mapMessagesToGenAI(opts.Messages)

	resp, err := m.client.Models.GenerateContent(ctx, m.modelID, contents, config)
	if err != nil {
		return nil, classifyVertexAIError(ErrVertexAIGenerationFailed, err)
	}

	result, err := mapGenAIResponse(resp)
	if err != nil {
		return nil, classifyVertexAIError(ErrVertexAIGenerationFailed, err)
	}

	result.ModelID = m.modelID

	return result, nil
}

// StreamText performs a streaming text generation using the Vertex AI API.
func (m *VertexAIModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	config := buildGenerateContentConfig(opts)
	contents := mapMessagesToGenAI(opts.Messages)

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go func() {
		defer close(eventCh)

		for resp, err := range m.client.Models.GenerateContentStream(streamCtx, m.modelID, contents, config) {
			if err != nil {
				sendStreamEvent(streamCtx, eventCh, newStreamEventError(
					classifyVertexAIError(ErrVertexAIStreamFailed, err),
				))

				return
			}

			emitStreamEventsFromResponse(streamCtx, eventCh, resp)
		}

		// Stream completed successfully -- send the done event.
		sendStreamEvent(streamCtx, eventCh, newStreamEventDone("", nil))
	}()

	return NewStreamIterator(eventCh, cancel), nil
}

// Compile-time interface assertions.
var (
	_ ProviderFactory = (*vertexAIModelFactory)(nil)
	_ LanguageModel   = (*VertexAIModel)(nil)
)

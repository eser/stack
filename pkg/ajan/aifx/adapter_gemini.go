package aifx

import (
	"context"
	"errors"
	"fmt"

	"google.golang.org/genai"
)

// Sentinel errors for the Gemini adapter.
var (
	ErrGeminiGenerationFailed = errors.New("gemini generation failed")
	ErrGeminiStreamFailed     = errors.New("gemini stream failed")
	ErrGeminiClientCreate     = errors.New("gemini client creation failed")
)

const geminiProviderName = "gemini"

// classifyGeminiError wraps err with the provider sentinel and, when the
// underlying error is a GenAI API error, inserts a provider-agnostic
// classification sentinel so callers can use errors.Is without importing the SDK.
func classifyGeminiError(providerSentinel error, err error) error {
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

// geminiCapabilities returns the capabilities supported by the Gemini adapter.
func geminiCapabilities() []ProviderCapability {
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

// geminiModelFactory creates Gemini language models.
type geminiModelFactory struct{}

// NewGeminiModelFactory returns a new ProviderFactory for Google Gemini.
func NewGeminiModelFactory() ProviderFactory { //nolint:ireturn
	return &geminiModelFactory{}
}

func (f *geminiModelFactory) GetProvider() string {
	return geminiProviderName
}

func (f *geminiModelFactory) CreateModel(
	ctx context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	if config.APIKey == "" {
		return nil, fmt.Errorf("%w: %w", ErrGeminiClientCreate, ErrInvalidAPIKey)
	}

	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrGeminiClientCreate, ErrInvalidModel)
	}

	client, err := genai.NewClient(ctx, &genai.ClientConfig{ //nolint:exhaustruct
		APIKey:  config.APIKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrGeminiClientCreate, err)
	}

	return &GeminiModel{
		client:  client,
		modelID: config.Model,
	}, nil
}

// GeminiModel implements LanguageModel for Google Gemini.
type GeminiModel struct {
	client  *genai.Client
	modelID string
}

func (m *GeminiModel) GetCapabilities() []ProviderCapability {
	return geminiCapabilities()
}

func (m *GeminiModel) GetProvider() string {
	return geminiProviderName
}

func (m *GeminiModel) GetModelID() string {
	return m.modelID
}

func (m *GeminiModel) GetRawClient() any {
	return m.client
}

func (m *GeminiModel) Close(_ context.Context) error {
	// The genai client does not require explicit cleanup.
	return nil
}

// GenerateText performs a non-streaming text generation using the Gemini API.
func (m *GeminiModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	config := buildGenerateContentConfig(opts)
	contents := mapMessagesToGenAI(opts.Messages)

	resp, err := m.client.Models.GenerateContent(ctx, m.modelID, contents, config)
	if err != nil {
		return nil, classifyGeminiError(ErrGeminiGenerationFailed, err)
	}

	result, err := mapGenAIResponse(resp)
	if err != nil {
		return nil, classifyGeminiError(ErrGeminiGenerationFailed, err)
	}

	result.ModelID = m.modelID

	return result, nil
}

// StreamText performs a streaming text generation using the Gemini API.
func (m *GeminiModel) StreamText(
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
					classifyGeminiError(ErrGeminiStreamFailed, err),
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
	_ ProviderFactory = (*geminiModelFactory)(nil)
	_ LanguageModel   = (*GeminiModel)(nil)
)

package aifx

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
)

// Sentinel errors for the Gemini adapter.
var (
	ErrGeminiGenerationFailed = errors.New("gemini generation failed")
	ErrGeminiStreamFailed     = errors.New("gemini stream failed")
	ErrGeminiClientCreate     = errors.New("gemini client creation failed")
)

const (
	geminiProviderName   = "gemini"
	geminiDefaultBaseURL = "https://generativelanguage.googleapis.com/"
)

// classifyGeminiError wraps err with the provider sentinel and, when the
// underlying error is a Gemini API error, inserts a provider-agnostic
// classification sentinel so callers can use errors.Is.
func classifyGeminiError(providerSentinel error, err error) error {
	return classifyProviderError(providerSentinel, err)
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
	_ context.Context,
	config *ConfigTarget,
) (LanguageModel, error) { //nolint:ireturn
	apiKey := ResolveAPIKey(config)
	if apiKey == "" {
		return nil, fmt.Errorf("%w: %w", ErrGeminiClientCreate, ErrInvalidAPIKey)
	}

	if config.Model == "" {
		return nil, fmt.Errorf("%w: %w", ErrGeminiClientCreate, ErrInvalidModel)
	}

	return &GeminiModel{
		client:  newGeminiClient(config, apiKey, &http.Client{}), //nolint:exhaustruct
		modelID: config.Model,
	}, nil
}

// newGeminiClient builds the Gemini API client. The base URL is
// config.BaseURL, else GOOGLE_GEMINI_BASE_URL, else the public API.
func newGeminiClient(config *ConfigTarget, apiKey string, httpClient *http.Client) *googleClient {
	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = os.Getenv("GOOGLE_GEMINI_BASE_URL")
	}

	if baseURL == "" {
		baseURL = geminiDefaultBaseURL
	}

	headers := http.Header{}
	headers.Set("X-Goog-Api-Key", apiKey)

	return &googleClient{
		transport: newGoogleTransport(baseURL, headers, config, httpClient),
		project:   "",
		location:  "",
		backend:   googleBackendGeminiAPI,
	}
}

// GeminiModel implements LanguageModel for Google Gemini.
type GeminiModel struct {
	client  *googleClient
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

// GetRawClient returns the *http.Client the model sends through.
func (m *GeminiModel) GetRawClient() any {
	if m.client == nil {
		return nil
	}

	return m.client.transport.client
}

func (m *GeminiModel) Close(_ context.Context) error {
	return nil
}

// GenerateText performs a non-streaming text generation using the Gemini API.
func (m *GeminiModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	config, err := buildGenerateContentConfig(opts)
	if err != nil {
		return nil, classifyGeminiError(ErrGeminiGenerationFailed, err)
	}

	request := newGenAIRequest(mapMessagesToGenAI(opts.Messages), config)

	resp, err := m.client.generate(ctx, m.modelID, request)
	if err != nil {
		return nil, classifyGeminiError(ErrGeminiGenerationFailed, err)
	}

	result, err := mapGenAIResponse(resp)
	if err != nil {
		return nil, classifyGeminiError(ErrGeminiGenerationFailed, err)
	}

	result.ModelID = m.modelID
	result.RawRequest = request

	return result, nil
}

// StreamText performs a streaming text generation using the Gemini API.
func (m *GeminiModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	config, err := buildGenerateContentConfig(opts)
	if err != nil {
		return nil, classifyGeminiError(ErrGeminiStreamFailed, err)
	}

	request := newGenAIRequest(mapMessagesToGenAI(opts.Messages), config)

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go func() {
		defer close(eventCh)
		defer cancel()

		streamGenAI(streamCtx, m.client, m.modelID, request, eventCh, func(err error) error {
			return classifyGeminiError(ErrGeminiStreamFailed, err)
		})
	}()

	return NewStreamIterator(eventCh, cancel), nil
}

// Compile-time interface assertions.
var (
	_ ProviderFactory = (*geminiModelFactory)(nil)
	_ LanguageModel   = (*GeminiModel)(nil)
)

package aifx

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
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
// underlying error is a Vertex AI API error, inserts a provider-agnostic
// classification sentinel so callers can use errors.Is.
func classifyVertexAIError(providerSentinel error, err error) error {
	return classifyProviderError(providerSentinel, err)
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

	client, err := newVertexAIClient(ctx, config, &http.Client{}) //nolint:exhaustruct
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrVertexAIClientCreate, err)
	}

	return &VertexAIModel{
		client:  client,
		modelID: config.Model,
	}, nil
}

// newVertexAIClient builds the Vertex AI client. An explicitly configured API
// key is sent as x-goog-api-key (Vertex AI express mode); without one, the
// request carries an access token from Application Default Credentials (see
// google_credentials.go).
//
// The base URL is config.BaseURL, else GOOGLE_VERTEX_BASE_URL, else the
// location's endpoint: aiplatform.googleapis.com for the global location or an
// API key, aiplatform.<location>.rep.googleapis.com for the us and eu
// multi-regions, and <location>-aiplatform.googleapis.com otherwise.
func newVertexAIClient(ctx context.Context, config *ConfigTarget, httpClient *http.Client) (*googleClient, error) {
	baseURL := config.BaseURL
	if baseURL == "" {
		baseURL = os.Getenv("GOOGLE_VERTEX_BASE_URL")
	}

	if baseURL == "" {
		baseURL = vertexAIBaseURL(config.Location, config.APIKey != "")
	}

	headers := http.Header{}

	transport := newGoogleTransport(baseURL, headers, config, httpClient)

	if config.APIKey != "" {
		headers.Set("X-Goog-Api-Key", config.APIKey)
	} else {
		credentials, err := detectGoogleCredentials(ctx, httpClient)
		if err != nil {
			return nil, err
		}

		transport.authorize = credentials.authorize
	}

	return &googleClient{
		transport: transport,
		project:   config.ProjectID,
		location:  config.Location,
		backend:   googleBackendVertexAI,
	}, nil
}

func vertexAIBaseURL(location string, apiKey bool) string {
	switch {
	case location == "global" || apiKey:
		return "https://aiplatform.googleapis.com/"
	case location == "us" || location == "eu":
		return "https://aiplatform." + location + ".rep.googleapis.com/"
	default:
		return "https://" + location + "-aiplatform.googleapis.com/"
	}
}

// VertexAIModel implements LanguageModel for Google Vertex AI.
type VertexAIModel struct {
	client  *googleClient
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

// GetRawClient returns the *http.Client the model sends through.
func (m *VertexAIModel) GetRawClient() any {
	if m.client == nil {
		return nil
	}

	return m.client.transport.client
}

func (m *VertexAIModel) Close(_ context.Context) error {
	return nil
}

// GenerateText performs a non-streaming text generation using the Vertex AI API.
func (m *VertexAIModel) GenerateText(
	ctx context.Context,
	opts *GenerateTextOptions,
) (*GenerateTextResult, error) {
	config, err := buildGenerateContentConfig(opts)
	if err != nil {
		return nil, classifyVertexAIError(ErrVertexAIGenerationFailed, err)
	}

	request := newGenAIRequest(mapMessagesToGenAI(opts.Messages), config)

	resp, err := m.client.generate(ctx, m.modelID, request)
	if err != nil {
		return nil, classifyVertexAIError(ErrVertexAIGenerationFailed, err)
	}

	result, err := mapGenAIResponse(resp)
	if err != nil {
		return nil, classifyVertexAIError(ErrVertexAIGenerationFailed, err)
	}

	result.ModelID = m.modelID
	result.RawRequest = request

	return result, nil
}

// StreamText performs a streaming text generation using the Vertex AI API.
func (m *VertexAIModel) StreamText(
	ctx context.Context,
	opts *StreamTextOptions,
) (*StreamIterator, error) {
	config, err := buildGenerateContentConfig(opts)
	if err != nil {
		return nil, classifyVertexAIError(ErrVertexAIStreamFailed, err)
	}

	request := newGenAIRequest(mapMessagesToGenAI(opts.Messages), config)

	streamCtx, cancel := context.WithCancel(ctx)
	eventCh := make(chan StreamEvent, 64) //nolint:mnd

	go func() {
		defer close(eventCh)
		defer cancel()

		streamGenAI(streamCtx, m.client, m.modelID, request, eventCh, func(err error) error {
			return classifyVertexAIError(ErrVertexAIStreamFailed, err)
		})
	}()

	return NewStreamIterator(eventCh, cancel), nil
}

// Compile-time interface assertions.
var (
	_ ProviderFactory = (*vertexAIModelFactory)(nil)
	_ LanguageModel   = (*VertexAIModel)(nil)
)

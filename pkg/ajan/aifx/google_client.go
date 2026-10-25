package aifx

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// ErrInvalidGoogleModel reports a model name that cannot be placed in a
// generateContent URL.
var ErrInvalidGoogleModel = errors.New("invalid model name")

// googleBackend is which generateContent API a googleClient calls.
type googleBackend int

const (
	googleBackendUnknown googleBackend = iota
	googleBackendGeminiAPI
	googleBackendVertexAI
)

// googleClient calls generateContent on the Gemini API or on Vertex AI. The
// two take the same body and differ in the URL and the credential.
type googleClient struct {
	transport *providerTransport
	project   string
	location  string
	backend   googleBackend
}

// googleAPIError is an error reply of the Gemini API or Vertex AI. Code is the
// "code" of the error body, which the genai SDK reported as the status; a body
// that is not the API's error object reports the HTTP status instead.
type googleAPIError struct {
	Message string           `json:"message,omitempty"`
	Status  string           `json:"status,omitempty"`
	Details []map[string]any `json:"details,omitempty"`
	Code    int              `json:"code,omitempty"`
}

func (e *googleAPIError) Error() string {
	return fmt.Sprintf("Error %d, Message: %s, Status: %s, Details: %v", e.Code, e.Message, e.Status, e.Details)
}

func newGoogleStatusError(_ *http.Request, resp *http.Response, body []byte) error {
	if len(body) == 0 {
		return &googleAPIError{Message: "", Status: resp.Status, Details: nil, Code: resp.StatusCode}
	}

	var wrapper struct {
		Error *googleAPIError `json:"error"`
	}

	if json.Unmarshal(body, &wrapper) == nil && wrapper.Error != nil {
		return wrapper.Error
	}

	return &googleAPIError{Message: string(body), Status: resp.Status, Details: nil, Code: resp.StatusCode}
}

// newGoogleTransport builds the transport of a Google backend. The genai SDK
// sent every request once; there are no retries.
func newGoogleTransport(baseURL string, headers http.Header, config *ConfigTarget, client *http.Client) *providerTransport {
	return &providerTransport{
		client:         client,
		headers:        headers,
		authorize:      nil,
		newStatusError: newGoogleStatusError,
		baseURL:        baseURL,
		defaultAccept:  "",
		timeout:        config.RequestTimeout,
		retry:          providerRetryPolicy{maxRetries: 0, retryAttemptTimeout: false},
	}
}

// methodPath is the URL path of a model method, such as generateContent.
func (c *googleClient) methodPath(model, method string) (string, error) {
	if model == "" || strings.ContainsAny(model, "?&#") || strings.Contains(model, "..") {
		return "", fmt.Errorf("%w %q: use a model id such as gemini-2.5-flash", ErrInvalidGoogleModel, model)
	}

	if c.backend == googleBackendVertexAI {
		name := model

		switch {
		case strings.HasPrefix(model, "projects/"), strings.HasPrefix(model, "models/"),
			strings.HasPrefix(model, "publishers/"):
		case strings.Contains(model, "/"):
			publisher, id, _ := strings.Cut(model, "/")
			name = "publishers/" + publisher + "/models/" + id
		default:
			name = "publishers/google/models/" + model
		}

		if !strings.HasPrefix(name, "projects/") && c.project != "" && c.location != "" {
			name = "projects/" + c.project + "/locations/" + c.location + "/" + name
		}

		return "v1beta1/" + name + ":" + method, nil
	}

	name := model
	if !strings.HasPrefix(model, "models/") && !strings.HasPrefix(model, "tunedModels/") {
		name = "models/" + model
	}

	return "v1beta/" + name + ":" + method, nil
}

// generate calls generateContent.
func (c *googleClient) generate(
	ctx context.Context,
	model string,
	request *genaiGenerateContentRequest,
) (*genaiGenerateContentResponse, error) {
	path, err := c.methodPath(model, "generateContent")
	if err != nil {
		return nil, err
	}

	var response genaiGenerateContentResponse

	err = c.transport.doJSON(ctx, http.MethodPost, path, nil, request, &response)
	if err != nil {
		return nil, err
	}

	return &response, nil
}

// stream calls streamGenerateContent and hands each chunk to onChunk. It
// returns at the first error: the reply's status, a chunk that does not
// decode, an error chunk or a failed read.
func (c *googleClient) stream(
	ctx context.Context,
	model string,
	request *genaiGenerateContentRequest,
	onChunk func(chunk *genaiGenerateContentResponse),
) error {
	path, err := c.methodPath(model, "streamGenerateContent")
	if err != nil {
		return err
	}

	body, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("encode generateContent request: %w", err)
	}

	resp, err := c.transport.send(ctx, &providerRequest{
		query:       url.Values{"alt": []string{"sse"}},
		method:      http.MethodPost,
		path:        path,
		contentType: mediaTypeJSON,
		accept:      "",
		body:        body,
	})
	if err != nil {
		return err
	}

	defer closeResponse(resp)

	scanner := genAIChunkScanner(resp.Body)

	for scanner.Scan() {
		token := scanner.Bytes()
		if len(token) == 0 {
			continue
		}

		prefix, data, _ := bytes.Cut(token, []byte(":"))
		if string(prefix) == "data" {
			var chunk genaiGenerateContentResponse

			err = json.Unmarshal(data, &chunk)
			if err != nil {
				return fmt.Errorf("%w: stream chunk: %w", ErrProviderResponseDecode, err)
			}

			onChunk(&chunk)

			continue
		}

		// A chunk that is not data is the API's error object, as when the
		// model fails after the stream started.
		var withError struct {
			Error *googleAPIError `json:"error"`
		}

		if json.Unmarshal(token, &withError) == nil && withError.Error != nil {
			return withError.Error
		}

		return fmt.Errorf("%w: invalid stream chunk of %d bytes", ErrProviderResponseDecode, len(token))
	}

	err = scanner.Err()
	if err != nil {
		return fmt.Errorf("read stream (chunk limit %d bytes): %w", sseMaxLineBytes, err)
	}

	return nil
}

// streamGenAI runs one Gemini or Vertex AI stream into eventCh: the chunks'
// events, then an error or the closing done event.
func streamGenAI(
	ctx context.Context,
	client *googleClient,
	model string,
	request *genaiGenerateContentRequest,
	eventCh chan<- StreamEvent,
	classify func(err error) error,
) {
	mapper := &genAIStreamMapper{calledTool: false}

	err := client.stream(ctx, model, request, func(chunk *genaiGenerateContentResponse) {
		mapper.emit(ctx, eventCh, chunk)
	})
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			err = ctxErr
		}

		sendStreamEvent(ctx, eventCh, newStreamEventError(classify(err)))

		return
	}

	// Stream completed successfully -- send the done event. The iterator
	// keeps the first done, so a finish reason sent by a chunk wins.
	sendStreamEvent(ctx, eventCh, newStreamEventDone("", nil))
}

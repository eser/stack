package httpfx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

var (
	ErrRequestBodyNil    = errors.New("request body is nil")
	ErrFailedToParseJSON = errors.New("failed to parse JSON body")
	ErrAlreadyWritten    = errors.New("response already written")
)

type ContextKey string

type Context struct {
	Request        *http.Request
	ResponseWriter http.ResponseWriter

	Results Results

	//nolint:dupword
	// Params  Params
	// Errors  errorMsgs |or|

	routeDef *Route
	handlers HandlerChain
	index    int
	// isAborted bool

	// IsRaw is true for routes registered via RouteRaw (WebTransport, raw streaming).
	// Middlewares that depend on Result body bytes (e.g. response_time timing log)
	// must no-op when this flag is set.
	IsRaw bool

	// EarlyWritten is set by WriteEarly. When true, the raw handler and all
	// downstream middleware steps must abort without writing a second response.
	EarlyWritten bool
}

// WriteEarly writes status and body directly to the ResponseWriter and marks
// the context as EarlyWritten. Used by middlewares on raw routes (e.g. PIN auth
// rejecting an unauth WebTransport upgrade) to short-circuit before the raw
// handler hijacks the connection. Subsequent middleware steps and the raw
// handler must check EarlyWritten and return without writing.
func (c *Context) WriteEarly(status int, body []byte) error {
	if c.EarlyWritten {
		return ErrAlreadyWritten
	}

	c.ResponseWriter.WriteHeader(status)

	_, err := c.ResponseWriter.Write(body)
	if err != nil {
		return fmt.Errorf("WriteEarly write: %w", err)
	}

	c.EarlyWritten = true

	return nil
}

func (c *Context) Next() Result {
	c.index++

	for c.index < len(c.handlers) {
		if c.handlers[c.index] == nil {
			c.index++

			continue
		}

		return c.handlers[c.index](c)
	}

	return c.Results.Ok()
}

func (c *Context) UpdateContext(ctx context.Context) {
	c.Request = c.Request.WithContext(ctx)
}

func (c *Context) ParseJSONBody(target any) error {
	if c.Request.Body == nil {
		return ErrRequestBodyNil
	}

	defer func() { _ = c.Request.Body.Close() }()

	decoder := json.NewDecoder(c.Request.Body)

	err := decoder.Decode(target)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToParseJSON, err)
	}

	return nil
}

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

package httpfx_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/eser/stack/pkg/ajan/httpfx"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResults_Ok(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	result := results.Ok()

	assert.Equal(t, http.StatusNoContent, result.StatusCode())
	assert.Empty(t, result.Body())
}

func TestResults_Bytes(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	body := []byte("test data")
	result := results.Bytes(body)

	assert.Equal(t, http.StatusOK, result.StatusCode())
	assert.Equal(t, body, result.Body())
}

func TestResults_PlainText(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	body := []byte("test data")
	result := results.PlainText(body)

	assert.Equal(t, http.StatusOK, result.StatusCode())
	assert.Equal(t, body, result.Body())
}

func TestResults_JSON(t *testing.T) {
	t.Parallel()

	type testStruct struct {
		Name  string `json:"name"`
		Value int    `json:"value"`
	}

	results := &httpfx.Results{}
	data := testStruct{
		Name:  "test",
		Value: 42,
	}

	result := results.JSON(data)
	assert.Equal(t, http.StatusOK, result.StatusCode())

	// Verify JSON encoding
	var decoded testStruct

	err := json.Unmarshal(result.Body(), &decoded)
	require.NoError(t, err)
	assert.Equal(t, data, decoded)
}

func TestResults_Redirect(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	uri := "/new-location"
	result := results.Redirect(uri)

	assert.Equal(t, http.StatusTemporaryRedirect, result.StatusCode())
	assert.Empty(t, result.Body())
	assert.Equal(t, uri, result.RedirectToURI())
}

func TestResults_NotFound(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	result := results.NotFound()

	assert.Equal(t, http.StatusNotFound, result.StatusCode())
	assert.Equal(t, []byte("Not Found"), result.Body())
}

func TestResults_Unauthorized(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	body := []byte("Unauthorized access")
	result := results.Unauthorized(httpfx.WithBody(body))

	assert.Equal(t, http.StatusUnauthorized, result.StatusCode())
	assert.Equal(t, body, result.Body())
}

func TestResults_BadRequest(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	result := results.BadRequest()

	assert.Equal(t, http.StatusBadRequest, result.StatusCode())
	assert.Equal(t, []byte("Bad Request"), result.Body())
}

func TestResults_Error(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	message := []byte("Custom error message")
	result := results.Error(http.StatusInternalServerError, httpfx.WithBody(message))

	assert.Equal(t, http.StatusInternalServerError, result.StatusCode())
	assert.Equal(t, message, result.Body())
}

func TestResults_Abort(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	result := results.Abort()

	assert.Equal(t, http.StatusNotImplemented, result.StatusCode())
	assert.Equal(t, []byte("Not Implemented"), result.Body())
}

func TestResult_WithStatusCode(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	result := results.Accepted()

	assert.Equal(t, http.StatusAccepted, result.StatusCode())
}

func TestResult_WithBody(t *testing.T) {
	t.Parallel()

	results := &httpfx.Results{}
	newBody := []byte("updated body")
	result := results.Ok(httpfx.WithBody(newBody))

	assert.Equal(t, newBody, result.Body())
}

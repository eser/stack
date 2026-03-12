package httpfx

import (
	"net/http"
	"sync"

	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx/uris"
)

//go:generate go tool stringer -type RouteParameterType -trimprefix RouteParameterType
type RouteParameterType int

const (
	RouteParameterTypeHeader RouteParameterType = iota
	RouteParameterTypeQuery
	RouteParameterTypePath
	RouteParameterTypeBody
)

type RouterParameterValidator func(inputString string) (string, error)

type RouterParameter struct {
	Name        string
	Description string
	Validators  []RouterParameterValidator
	Type        RouteParameterType
	IsRequired  bool
}

type RouteOpenAPISpecRequest struct {
	Model any
}

type RouteOpenAPISpecResponse struct {
	Model      any
	StatusCode int
	HasModel   bool
}

type RouteOpenAPISpec struct {
	OperationID string
	Summary     string
	Description string
	Tags        []string

	Requests   []RouteOpenAPISpecRequest
	Responses  []RouteOpenAPISpecResponse
	Deprecated bool
}

// Route represents a registered HTTP route with its handlers and metadata.
// Routes become immutable after the router is frozen (when the server starts).
type Route struct {
	Pattern        *uris.Pattern
	Parameters     []RouterParameter
	Handlers       []Handler
	MuxHandlerFunc func(http.ResponseWriter, *http.Request)

	Spec RouteOpenAPISpec

	// frozen indicates the route can no longer be modified
	frozen bool
	mu     sync.RWMutex
}

// checkFrozen panics if the route has been frozen.
func (r *Route) checkFrozen() {
	r.mu.RLock()
	frozen := r.frozen
	r.mu.RUnlock()

	if frozen {
		panic("httpfx: cannot modify frozen route")
	}
}

// Freeze marks the route as immutable.
func (r *Route) Freeze() {
	r.mu.Lock()
	r.frozen = true
	r.mu.Unlock()
}

// IsFrozen returns true if the route has been frozen.
func (r *Route) IsFrozen() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return r.frozen
}

// HasOperationID sets the OpenAPI operation ID for the route.
// Panics if the route has been frozen.
func (r *Route) HasOperationID(operationID string) *Route {
	r.checkFrozen()
	r.Spec.OperationID = operationID

	return r
}

// HasSummary sets the OpenAPI summary for the route.
// Panics if the route has been frozen.
func (r *Route) HasSummary(summary string) *Route {
	r.checkFrozen()
	r.Spec.Summary = summary

	return r
}

// HasDescription sets the OpenAPI description for the route.
// Panics if the route has been frozen.
func (r *Route) HasDescription(description string) *Route {
	r.checkFrozen()
	r.Spec.Description = description

	return r
}

// HasTags sets the OpenAPI tags for the route.
// Panics if the route has been frozen.
func (r *Route) HasTags(tags ...string) *Route {
	r.checkFrozen()

	// Defensive copy of tags
	r.Spec.Tags = make([]string, len(tags))
	copy(r.Spec.Tags, tags)

	return r
}

// IsDeprecated marks the route as deprecated in the OpenAPI spec.
// Panics if the route has been frozen.
func (r *Route) IsDeprecated() *Route {
	r.checkFrozen()
	r.Spec.Deprecated = true

	return r
}

// HasPathParameter adds a path parameter to the route.
// Panics if the route has been frozen.
func (r *Route) HasPathParameter(name string, description string) *Route {
	r.checkFrozen()
	r.Parameters = append(r.Parameters, RouterParameter{
		Type:        RouteParameterTypePath,
		Name:        name,
		Description: description,
		IsRequired:  true,

		Validators: []RouterParameterValidator{
			// func(inputString string) (string, error) {
			// 	return inputString, nil
			// },
		},
	})

	return r
}

// HasQueryParameter adds a query parameter to the route.
// Panics if the route has been frozen.
func (r *Route) HasQueryParameter(name string, description string) *Route {
	r.checkFrozen()
	r.Parameters = append(r.Parameters, RouterParameter{
		Type:        RouteParameterTypeQuery,
		Name:        name,
		Description: description,
		IsRequired:  true,

		Validators: []RouterParameterValidator{
			// func(inputString string) (string, error) {
			// 	return inputString, nil
			// },
		},
	})

	return r
}

// HasRequestModel sets the request model for the route.
// Panics if the route has been frozen.
func (r *Route) HasRequestModel(model any) *Route {
	r.checkFrozen()
	r.Spec.Requests = append(r.Spec.Requests, RouteOpenAPISpecRequest{
		Model: model,
	})

	return r
}

// HasResponse adds a response status code to the route.
// Panics if the route has been frozen.
func (r *Route) HasResponse(statusCode int) *Route {
	r.checkFrozen()
	r.Spec.Responses = append(r.Spec.Responses, RouteOpenAPISpecResponse{
		StatusCode: statusCode,
		HasModel:   false,
		Model:      nil,
	})

	return r
}

// HasResponseModel adds a response with a model to the route.
// Panics if the route has been frozen.
func (r *Route) HasResponseModel(statusCode int, model any) *Route {
	r.checkFrozen()
	r.Spec.Responses = append(r.Spec.Responses, RouteOpenAPISpecResponse{
		StatusCode: statusCode,
		HasModel:   true,
		Model:      model,
	})

	return r
}

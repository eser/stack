package openapi

import (
	"github.com/eser/stack/apps/services/pkg/eser-go/httpfx"
	"github.com/getkin/kin-openapi/openapi3"
)

func GenerateOpenAPISpec(identity *APIIdentity, routes *httpfx.Router) any {
	spec := &openapi3.T{ //nolint:exhaustruct
		OpenAPI: "3.0.0",
		Info: &openapi3.Info{ //nolint:exhaustruct
			Title:      identity.name,
			Version:    identity.version,
			Extensions: make(map[string]any),
		},
		Components: &openapi3.Components{ //nolint:exhaustruct
			Schemas:    make(openapi3.Schemas),
			Extensions: make(map[string]any),
		},
		Paths: &openapi3.Paths{ //nolint:exhaustruct
			Extensions: make(map[string]any),
		},
		Extensions: make(map[string]any),
	}

	for _, route := range routes.GetRoutes() {
		operation := &openapi3.Operation{ //nolint:exhaustruct
			Extensions: make(map[string]any),

			Tags:        route.Spec.Tags,
			Summary:     route.Spec.Summary,
			Description: route.Spec.Description,
			OperationID: route.Spec.OperationID,

			Responses:  &openapi3.Responses{}, //nolint:exhaustruct
			Deprecated: route.Spec.Deprecated,
		}

		for _, response := range route.Spec.Responses {
			description := ""

			operation.AddResponse(response.StatusCode, &openapi3.Response{ //nolint:exhaustruct
				Extensions: make(map[string]any),

				Description: &description,
				Headers:     openapi3.Headers{},
				Content:     openapi3.Content{},
				Links:       openapi3.Links{},
			})
		}

		path := &openapi3.PathItem{} //nolint:exhaustruct
		path.SetOperation(route.Pattern.Method, operation)

		spec.Paths.Set(route.Pattern.Path, path)
	}

	return spec
}

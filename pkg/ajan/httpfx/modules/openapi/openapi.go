package openapi

import (
	"github.com/eser/stack/pkg/ajan/httpfx"
)

type APIIdentity struct {
	name    string
	version string
}

func RegisterHTTPRoutes(routes *httpfx.Router, config *httpfx.Config) {
	if !config.OpenAPIEnabled {
		return
	}

	routes.
		Route("GET /openapi.json", func(ctx *httpfx.Context) httpfx.Result {
			spec := &APIIdentity{
				name:    "golang-service",
				version: "0.0.0",
			}

			result := GenerateOpenAPISpec(spec, routes)

			return ctx.Results.JSON(result)
		}).
		HasSummary("OpenAPI Spec").
		HasDescription("OpenAPI Spec Endpoint")
}

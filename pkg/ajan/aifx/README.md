# 🤖 [ajan/aifx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/aifx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

**aifx** gives one `LanguageModel` interface over the Anthropic, OpenAI, Gemini,
Vertex AI and Ollama HTTP APIs and over the claude, opencode and kiro command
line agents: text generation, streaming, tool calls, structured output, effort
and thinking settings, and batches where the provider has them. The HTTP
providers are written on `net/http` alone (decision-55); no vendor SDK is
linked. This page is the reference for configuring them.

## Quick Start

A registry with every built-in provider creates a model from a `ConfigTarget`
and generates one reply. The key is read from `ANTHROPIC_API_KEY` because the
target sets none:

```go
package main

import (
	"context"
	"fmt"

	"github.com/eser/stack/pkg/ajan/aifx"
)

func main() {
	ctx := context.Background()

	registry := aifx.NewRegistry(aifx.WithDefaultFactories())
	defer func() { _ = registry.Close(ctx) }()

	model, err := registry.AddModel(ctx, "default", &aifx.ConfigTarget{
		Provider:  "anthropic",
		Model:     "claude-sonnet-5",
		MaxTokens: 1024,
	})
	if err != nil {
		panic(err)
	}

	result, err := model.GenerateText(ctx, &aifx.GenerateTextOptions{
		Messages: []aifx.Message{aifx.NewTextMessage(aifx.RoleUser, "Hello")},
	})
	if err != nil {
		panic(err)
	}

	fmt.Println(result.Text())
}
```

`StreamText` takes the same options and returns a `StreamIterator`; call `Next`
and `Current` until it returns false, then check `Err`, or call `Collect`.
Cancelling the context, or calling `Close` on the iterator, stops the request
and closes its connection.

## Credentials

A `ConfigTarget.APIKey` always wins. Without one, each provider reads its own
environment variables, in this order:

| Provider    | Environment variables                                                                                    |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `anthropic` | `ANTHROPIC_API_KEY` (sent as `X-Api-Key`), then `ANTHROPIC_AUTH_TOKEN` (sent as `Authorization: Bearer`) |
| `openai`    | `OPENAI_API_KEY`; `OPENAI_ORG_ID` and `OPENAI_PROJECT_ID` set the organization and project headers       |
| `gemini`    | `GOOGLE_API_KEY`, then `GEMINI_API_KEY`                                                                  |
| `vertexai`  | no API key variable: see below                                                                           |

Exactly one credential is sent per request: an Anthropic key and a token in the
environment never travel together.

### Vertex AI credential sources

`vertexai` needs `ProjectID` and `Location`. With `APIKey` set, the key is sent
as `x-goog-api-key` (Vertex AI express mode). Without it, the model sends an
OAuth access token from the first of these sources, the order Application
Default Credentials uses:

1. The JSON file that `GOOGLE_APPLICATION_CREDENTIALS` names.
2. gcloud's file, written by `gcloud auth application-default login`:
   `$HOME/.config/gcloud/application_default_credentials.json`, or
   `%APPDATA%\gcloud\application_default_credentials.json` on Windows.
3. The metadata server of Google Cloud compute: the host in `GCE_METADATA_HOST`
   when it is set, otherwise `169.254.169.254` when it answers within two
   seconds.

A credentials file can be a service account key (`"type": "service_account"`,
exchanged at its `token_uri` through an RS256-signed JWT) or gcloud user
credentials (`"type": "authorized_user"`, exchanged through the refresh token).
Workload identity federation (`external_account`), impersonated service accounts
and other types are reported as unsupported when the model is created; use a
service account key, gcloud credentials, the metadata server or an API key
instead. The quota project comes from `GOOGLE_CLOUD_QUOTA_PROJECT`, else from
the file's `quota_project_id`, and is sent as `X-Goog-User-Project`.

Tokens are cached and fetched again 3 minutes 45 seconds before they expire.
When no source is found, `CreateModel` fails with
`ErrGoogleCredentialsNotFound`.

## Endpoints

`ConfigTarget.BaseURL` sets the endpoint of every HTTP provider. Without it:

| Provider    | Base URL                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| `anthropic` | `ANTHROPIC_BASE_URL`, else `https://api.anthropic.com/`                     |
| `openai`    | `OPENAI_BASE_URL`, else `https://api.openai.com/v1/`                        |
| `gemini`    | `GOOGLE_GEMINI_BASE_URL`, else `https://generativelanguage.googleapis.com/` |
| `vertexai`  | `GOOGLE_VERTEX_BASE_URL`, else the location's endpoint                      |

The Vertex AI location's endpoint is `https://aiplatform.googleapis.com/` for
the `global` location and for an API key,
`https://aiplatform.us.rep.googleapis.com/` and the `eu` equivalent for the
multi-regions, and `https://your_location-aiplatform.googleapis.com/` otherwise.
Paths are joined to the base URL as to a directory, so a proxy prefix such as
`https://proxy.example/v1` is kept.

## Timeouts, retries and limits

- `ConfigTarget.RequestTimeout` bounds each attempt of a request, including the
  whole body of a streamed reply. Zero means no timeout.
- Anthropic and OpenAI requests are sent again up to two times after a
  connection error or a 408, 409, 429 or 5xx reply. `Retry-After-Ms` and
  `Retry-After` under a minute are honoured; otherwise the wait doubles from
  half a second up to eight seconds, with jitter. An `x-should-retry` header
  overrides the status. Anthropic also retries an attempt that ran out of its
  timeout; OpenAI does not. Gemini and Vertex AI requests are sent once.
- A non-streaming reply is read up to 64 MiB, one line of a stream up to 32 MiB,
  an OpenAI batch output file up to 512 MiB, and a token reply up to 1 MiB. A
  larger reply fails with `lib.ErrReadLimitExceeded`.

## Errors

Every error wraps the provider's sentinel (`ErrAnthropicGenerationFailed`,
`ErrOpenAIStreamFailed`, `ErrVertexAIClientCreate` and the rest). An HTTP error
reply also wraps a classification sentinel (`ErrRateLimited`, `ErrAuthFailed`,
`ErrInsufficientCredits`, `ErrBadRequest`, `ErrServiceUnavailable`) and an
`*APIError` that keeps the status. `ErrorKind` and `ErrorStatus` read both in a
form that crosses the FFI bridge; a cancelled context reports the kind
`cancelled`.

## Testing

`testdata/fixtures/<provider>/<scenario>.json` holds, per scenario, the requests
a provider sends and the result, stream events or error it produces. They were
recorded from the vendor SDK implementation before the move to `net/http`, and
`TestProviderFixtures` replays them against the current code;
`provider_fixtures_test.go` explains the format and how to record them again.
The tests use `httptest` servers only and need no network.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/aifx`: the API reference generated from
  source
- [ajan/acpfx](../acpfx/): the agent client protocol behind the command line
  providers
- [@eserstack/ai](../../@eserstack/ai/README.md): the TypeScript package that
  reaches this library through the FFI bridge
- [eser/stack on GitHub](https://github.com/eser/stack)

package aifx

// The generateContent wire format of the Gemini API and Vertex AI, limited to
// what aifx sends and reads. Both backends take the same body; the fixtures in
// testdata/fixtures/gemini and testdata/fixtures/vertexai pin it as the genai
// SDK built it.

// genaiFinishReason is a candidate's finishReason.
type genaiFinishReason string

const (
	genaiFinishReasonStop                   genaiFinishReason = "STOP"
	genaiFinishReasonMaxTokens              genaiFinishReason = "MAX_TOKENS"
	genaiFinishReasonSafety                 genaiFinishReason = "SAFETY"
	genaiFinishReasonRecitation             genaiFinishReason = "RECITATION"
	genaiFinishReasonLanguage               genaiFinishReason = "LANGUAGE"
	genaiFinishReasonOther                  genaiFinishReason = "OTHER"
	genaiFinishReasonBlocklist              genaiFinishReason = "BLOCKLIST"
	genaiFinishReasonProhibitedContent      genaiFinishReason = "PROHIBITED_CONTENT"
	genaiFinishReasonSPII                   genaiFinishReason = "SPII"
	genaiFinishReasonMalformedFunctionCall  genaiFinishReason = "MALFORMED_FUNCTION_CALL"
	genaiFinishReasonImageSafety            genaiFinishReason = "IMAGE_SAFETY"
	genaiFinishReasonImageProhibitedContent genaiFinishReason = "IMAGE_PROHIBITED_CONTENT"
	genaiFinishReasonImageRecitation        genaiFinishReason = "IMAGE_RECITATION"
)

// genaiBlockedReasonUnspecified is the promptFeedback.blockReason that blocks nothing.
const genaiBlockedReasonUnspecified = "BLOCKED_REASON_UNSPECIFIED"

// genaiThinkingLevel is a thinkingConfig.thinkingLevel.
type genaiThinkingLevel string

const (
	genaiThinkingLevelLow    genaiThinkingLevel = "LOW"
	genaiThinkingLevelMedium genaiThinkingLevel = "MEDIUM"
	genaiThinkingLevelHigh   genaiThinkingLevel = "HIGH"
)

type genaiContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []*genaiPart `json:"parts,omitempty"`
}

type genaiPart struct {
	InlineData       *genaiBlob             `json:"inlineData,omitempty"`
	FileData         *genaiFileData         `json:"fileData,omitempty"`
	FunctionCall     *genaiFunctionCall     `json:"functionCall,omitempty"`
	FunctionResponse *genaiFunctionResponse `json:"functionResponse,omitempty"`
	Text             string                 `json:"text,omitempty"`
	Thought          bool                   `json:"thought,omitempty"`
}

// genaiBlob is inline data; encoding/json sends and reads Data as standard
// base64, which is the API's encoding.
type genaiBlob struct {
	MIMEType string `json:"mimeType,omitempty"`
	Data     []byte `json:"data,omitempty"`
}

type genaiFileData struct {
	FileURI  string `json:"fileUri,omitempty"`
	MIMEType string `json:"mimeType,omitempty"`
}

type genaiFunctionCall struct {
	Args map[string]any `json:"args,omitempty"`
	ID   string         `json:"id,omitempty"`
	Name string         `json:"name,omitempty"`
}

type genaiFunctionResponse struct {
	Response map[string]any `json:"response,omitempty"`
	Name     string         `json:"name,omitempty"`
}

type genaiTool struct {
	FunctionDeclarations []*genaiFunctionDeclaration `json:"functionDeclarations,omitempty"`
}

type genaiFunctionDeclaration struct {
	ParametersJSONSchema any    `json:"parametersJsonSchema,omitempty"`
	Description          string `json:"description,omitempty"`
	Name                 string `json:"name,omitempty"`
}

type genaiSafetySetting struct {
	Category  string `json:"category,omitempty"`
	Threshold string `json:"threshold,omitempty"`
}

type genaiThinkingConfig struct {
	ThinkingBudget *int32             `json:"thinkingBudget,omitempty"`
	ThinkingLevel  genaiThinkingLevel `json:"thinkingLevel,omitempty"`
}

// genaiGenerateContentConfig gathers the request's settings before they are
// laid out as the generateContent body.
type genaiGenerateContentConfig struct {
	SystemInstruction  *genaiContent
	Temperature        *float32
	TopP               *float32
	ThinkingConfig     *genaiThinkingConfig
	ResponseJSONSchema any
	ResponseMIMEType   string
	StopSequences      []string
	Tools              []*genaiTool
	SafetySettings     []*genaiSafetySetting
	MaxOutputTokens    int32
}

// genaiGenerateContentRequest is the body of :generateContent and
// :streamGenerateContent.
type genaiGenerateContentRequest struct {
	SystemInstruction *genaiContent          `json:"systemInstruction,omitempty"`
	GenerationConfig  *genaiGenerationConfig `json:"generationConfig"`
	Contents          []*genaiContent        `json:"contents"`
	SafetySettings    []*genaiSafetySetting  `json:"safetySettings,omitempty"`
	Tools             []*genaiTool           `json:"tools,omitempty"`
}

type genaiGenerationConfig struct {
	Temperature        *float32             `json:"temperature,omitempty"`
	TopP               *float32             `json:"topP,omitempty"`
	ThinkingConfig     *genaiThinkingConfig `json:"thinkingConfig,omitempty"`
	ResponseJSONSchema any                  `json:"responseJsonSchema,omitempty"`
	ResponseMIMEType   string               `json:"responseMimeType,omitempty"`
	StopSequences      []string             `json:"stopSequences,omitempty"`
	MaxOutputTokens    int32                `json:"maxOutputTokens,omitempty"`
}

// newGenAIRequest lays the contents and config out as the request body. The
// SDK sent the system instruction with the user role, and a generationConfig
// even when it was empty.
func newGenAIRequest(contents []*genaiContent, config *genaiGenerateContentConfig) *genaiGenerateContentRequest {
	request := &genaiGenerateContentRequest{
		SystemInstruction: nil,
		GenerationConfig:  nil,
		Contents:          contents,
		SafetySettings:    config.SafetySettings,
		Tools:             config.Tools,
	}

	if config.SystemInstruction != nil {
		instruction := *config.SystemInstruction
		if instruction.Role == "" {
			instruction.Role = genaiRoleUser
		}

		request.SystemInstruction = &instruction
	}

	request.GenerationConfig = &genaiGenerationConfig{
		Temperature:        config.Temperature,
		TopP:               config.TopP,
		ThinkingConfig:     config.ThinkingConfig,
		ResponseJSONSchema: config.ResponseJSONSchema,
		ResponseMIMEType:   config.ResponseMIMEType,
		StopSequences:      config.StopSequences,
		MaxOutputTokens:    config.MaxOutputTokens,
	}

	return request
}

// genaiGenerateContentResponse is a reply, or one chunk of a streamed reply.
type genaiGenerateContentResponse struct {
	PromptFeedback *genaiPromptFeedback `json:"promptFeedback,omitempty"`
	UsageMetadata  *genaiUsageMetadata  `json:"usageMetadata,omitempty"`
	ModelVersion   string               `json:"modelVersion,omitempty"`
	Candidates     []*genaiCandidate    `json:"candidates,omitempty"`
}

type genaiCandidate struct {
	Content      *genaiContent     `json:"content,omitempty"`
	FinishReason genaiFinishReason `json:"finishReason,omitempty"`
}

type genaiPromptFeedback struct {
	BlockReason string `json:"blockReason,omitempty"`
}

type genaiUsageMetadata struct {
	PromptTokenCount     int32 `json:"promptTokenCount,omitempty"`
	CandidatesTokenCount int32 `json:"candidatesTokenCount,omitempty"`
	TotalTokenCount      int32 `json:"totalTokenCount,omitempty"`
	ThoughtsTokenCount   int32 `json:"thoughtsTokenCount,omitempty"`
}

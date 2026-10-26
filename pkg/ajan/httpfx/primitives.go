package httpfx

type (
	Handler      func(*Context) Result
	HandlerChain []Handler
	Middleware   func() Handler
)

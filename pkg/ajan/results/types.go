package results

type ResultKind int

//go:generate go tool stringer -type ResultKind -trimprefix ResultKind
const (
	ResultKindSuccess ResultKind = 0
	ResultKindError   ResultKind = 1
)

var Ok = Define( //nolint:gochecknoglobals
	ResultKindSuccess,
	"OK",
	"OK",
)

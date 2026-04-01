//go:build wasip1 && !eserajan_reactor

package main

import (
	"encoding/json"
	"io"
	"os"
)

// request is the JSON request envelope read from stdin.
type request struct {
	Fn   string          `json:"fn"`
	Args json.RawMessage `json:"args,omitempty"`
}

// response is the JSON response envelope written to stdout.
type response struct {
	OK     bool   `json:"ok"`
	Result string `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

func main() {
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		writeError("failed to read stdin: " + err.Error())
		return
	}

	var req request
	if err := json.Unmarshal(data, &req); err != nil {
		writeError("invalid JSON: " + err.Error())
		return
	}

	switch req.Fn {
	case "version":
		writeOK(bridgeVersion())

	case "init":
		code := bridgeInit()
		if code != 0 {
			writeError("init failed")
			return
		}
		writeOK("initialized")

	case "shutdown":
		bridgeShutdown()
		writeOK("shutdown")

	case "configLoad":
		path, err := extractStringArg(req.Args, "path")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeConfigLoad(path))

	case "diResolve":
		name, err := extractStringArg(req.Args, "name")
		if err != nil {
			writeError(err.Error())
			return
		}
		writeOK(bridgeDIResolve(name))

	default:
		writeError("unknown function: " + req.Fn)
	}
}

// extractStringArg extracts a named string field from a JSON args object.
func extractStringArg(raw json.RawMessage, key string) (string, error) {
	if raw == nil {
		return "", &json.UnmarshalTypeError{Value: "null", Type: nil}
	}

	var m map[string]string
	if err := json.Unmarshal(raw, &m); err != nil {
		return "", err
	}

	v, ok := m[key]
	if !ok {
		return "", &missingArgError{key: key}
	}

	return v, nil
}

type missingArgError struct {
	key string
}

func (e *missingArgError) Error() string {
	return "missing required arg: " + e.key
}

func writeOK(result string) {
	resp := response{OK: true, Result: result}
	data, _ := json.Marshal(resp)
	os.Stdout.Write(data)
	os.Stdout.Write([]byte("\n"))
}

func writeError(msg string) {
	resp := response{OK: false, Error: msg}
	data, _ := json.Marshal(resp)
	os.Stdout.Write(data)
	os.Stdout.Write([]byte("\n"))
}

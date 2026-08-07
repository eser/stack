package acpfx

import (
	"context"
	"io"
	"net"
)

// InProcess connects a Client to an AgentHandler running in this same process,
// with no subprocess and no binary on PATH.
//
// # Why this exists
//
// ACP is a subprocess protocol, and for a genuinely external agent -- gemini
// --acp, claude-agent-acp -- Spawn is the right entry point: that agent is
// another program, and the pipe is a real boundary.
//
// An agent implemented in this repo is not another program.
// pkg/ajan/acpfx/shim implements ACP over the vendor CLIs, in Go, linked into
// the same binary as the caller. Reaching it through Spawn would mean building a
// separate executable, shipping it, installing it, putting it on PATH, probing
// for its presence, and explaining its absence in an error message -- so that Go
// could serialise JSON down a pipe to reach a struct it already had in memory.
// The process boundary buys nothing and costs an entire distribution problem.
//
// net.Pipe gives a synchronous, in-memory, full-duplex connection: the exact
// semantics of the stdio pair, minus the process. The protocol, the handshake,
// the capability negotiation and every test written against them are unchanged
// -- only the transport is.
//
// The returned Client owns both ends: Close shuts the agent down with it.
func InProcess(
	ctx context.Context,
	handler AgentHandler,
	clientHandler ClientHandler,
	info *Implementation,
) (*Client, error) {
	clientConn, agentConn := net.Pipe()

	agent := NewAgent(agentConn, agentConn, agentConn, handler)

	client, err := NewClient(
		ctx,
		clientConn,
		clientConn,
		&pipeCloser{client: clientConn, agent: agent},
		clientHandler,
		info,
	)
	if err != nil {
		_ = agent.Close()
		_ = clientConn.Close()

		return nil, err
	}

	return client, nil
}

// pipeCloser tears down both halves of an in-process link.
//
// Closing only the client end would leave the agent's read loop parked on a pipe
// that never reaches EOF, leaking a goroutine per session -- the in-memory
// equivalent of the unreaped-child class Spawn's Close exists to prevent.
type pipeCloser struct {
	client io.Closer
	agent  *Agent
}

func (p *pipeCloser) Close() error {
	agentErr := p.agent.Close()

	if err := p.client.Close(); err != nil {
		return err //nolint:wrapcheck
	}

	return agentErr //nolint:wrapcheck
}

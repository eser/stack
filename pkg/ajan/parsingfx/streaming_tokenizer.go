// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package parsingfx

import (
	"context"
	"unicode/utf8"
)

// Tokenizer holds state for incremental (streaming) tokenization.
// Chunks are fed via Push; remaining content is flushed with Flush.
type Tokenizer struct {
	defs   []compiledDefinition
	buffer string
}

// NewTokenizer creates a Tokenizer from the given token definitions.
func NewTokenizer(defs []TokenDefinition) (*Tokenizer, error) {
	compiled, err := compileDefinitions(defs)
	if err != nil {
		return nil, err
	}

	return &Tokenizer{defs: compiled}, nil
}

// Push appends chunk to the internal buffer and returns all tokens that can be
// unambiguously matched. When no pattern matches at the current buffer head,
// Push stops and retains the unmatched suffix — this preserves tokens that
// span chunk boundaries.
func (t *Tokenizer) Push(chunk string) ([]Token, error) {
	t.buffer += chunk

	return t.drain(false)
}

// Flush tokenizes all remaining buffer content. Unmatched characters are
// emitted as T_UNKNOWN tokens. Call after all chunks have been pushed.
func (t *Tokenizer) Flush() ([]Token, error) {
	return t.drain(true)
}

// drain is the shared matching loop for Push and Flush.
func (t *Tokenizer) drain(flush bool) ([]Token, error) {
	var tokens []Token
	offset := 0

	for offset < len(t.buffer) {
		remaining := t.buffer[offset:]
		matched := false

		for _, cd := range t.defs {
			loc := cd.pattern.FindStringIndex(remaining)
			if loc == nil || loc[0] != 0 {
				continue
			}

			tokens = append(tokens, Token{
				Kind:   cd.name,
				Value:  remaining[loc[0]:loc[1]],
				Offset: offset,
				Length: loc[1] - loc[0],
			})
			offset += loc[1]
			matched = true

			break
		}

		if !matched {
			if !flush {
				// No pattern matches buffer head: might be a partial token
				// spanning the chunk boundary. Hold remaining for next Push.
				break
			}

			_, size := utf8.DecodeRuneInString(remaining)
			tokens = append(tokens, Token{
				Kind:   "T_UNKNOWN",
				Value:  remaining[:size],
				Offset: offset,
				Length: size,
			})
			offset += size
		}
	}

	t.buffer = t.buffer[offset:]

	return tokens, nil
}

// TokenizeStream runs a Tokenizer goroutine that reads string chunks from in,
// tokenizes them incrementally, and sends token batches to the returned channel.
// The error channel receives at most one value; both channels are closed when done.
func TokenizeStream(ctx context.Context, in <-chan string, defs []TokenDefinition) (<-chan []Token, <-chan error) {
	outCh := make(chan []Token)
	errCh := make(chan error, 1)

	go func() {
		defer close(outCh)
		defer close(errCh)

		t, err := NewTokenizer(defs)
		if err != nil {
			errCh <- err
			return
		}

		for {
			select {
			case <-ctx.Done():
				errCh <- ctx.Err()
				return
			case chunk, ok := <-in:
				if !ok {
					tokens, ferr := t.Flush()
					if ferr != nil {
						errCh <- ferr
						return
					}

					if len(tokens) > 0 {
						select {
						case outCh <- tokens:
						case <-ctx.Done():
							errCh <- ctx.Err()
							return
						}
					}

					return
				}

				tokens, perr := t.Push(chunk)
				if perr != nil {
					errCh <- perr
					return
				}

				if len(tokens) > 0 {
					select {
					case outCh <- tokens:
					case <-ctx.Done():
						errCh <- ctx.Err()
						return
					}
				}
			}
		}
	}()

	return outCh, errCh
}

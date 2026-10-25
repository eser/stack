// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package vt

// The parser is the DEC VT500 state machine (Paul Williams' model) with the
// transition table xterm.js uses, so control sequences split across writes,
// C0 controls inside sequences and malformed input resolve the same way they
// do in the browser frontend.

type parserState uint8

const (
	stateGround parserState = iota
	stateEscape
	stateEscapeIntermediate
	stateCsiEntry
	stateCsiParam
	stateCsiIntermediate
	stateCsiIgnore
	stateSosPmApcString
	stateOscString
	stateDcsEntry
	stateDcsParam
	stateDcsIgnore
	stateDcsIntermediate
	stateDcsPassthrough

	stateCount
)

type parserAction uint8

const (
	actionIgnore parserAction = iota
	actionError
	actionPrint
	actionExecute
	actionOscStart
	actionOscPut
	actionOscEnd
	actionCsiDispatch
	actionParam
	actionCollect
	actionEscDispatch
	actionClear
	actionDcsHook
	actionDcsPut
	actionDcsUnhook
)

// nonASCIIPrintable stands in for every code point from U+00A0 up when
// looking up a transition.
const nonASCIIPrintable = 0xA0

const (
	maxParams    = 32
	maxSubParams = 32
	maxParamVal  = 0x7FFFFFFF
	// maxOscLength bounds the OSC payload kept in memory; longer payloads are
	// dropped, not truncated, since a cut title or colour spec means nothing.
	maxOscLength = 4096
)

type transitionTable [int(stateCount) * 256]uint8

func (t *transitionTable) add(code int, state parserState, action parserAction, next parserState) {
	t[int(state)<<8|code] = uint8(action)<<4 | uint8(next)
}

func (t *transitionTable) addRange(lo, hi int, state parserState, action parserAction, next parserState) {
	for code := lo; code < hi; code++ {
		t.add(code, state, action, next)
	}
}

func (t *transitionTable) addMany(codes []int, state parserState, action parserAction, next parserState) {
	for _, code := range codes {
		t.add(code, state, action, next)
	}
}

func newTransitionTable() *transitionTable {
	t := &transitionTable{}

	for i := range t {
		t[i] = uint8(actionError)<<4 | uint8(stateGround)
	}

	executables := make([]int, 0, 32)
	for code := 0x00; code < 0x18; code++ {
		executables = append(executables, code)
	}

	executables = append(executables, 0x19)
	for code := 0x1c; code < 0x20; code++ {
		executables = append(executables, code)
	}

	t.addRange(0x20, 0x7f, stateGround, actionPrint, stateGround)

	for state := stateGround; state < stateCount; state++ {
		t.addMany([]int{0x18, 0x1a, 0x99, 0x9a}, state, actionExecute, stateGround)
		t.addRange(0x80, 0x90, state, actionExecute, stateGround)
		t.addRange(0x90, 0x98, state, actionExecute, stateGround)
		t.add(0x9c, state, actionIgnore, stateGround)
		t.add(0x1b, state, actionClear, stateEscape)
		t.add(0x9d, state, actionOscStart, stateOscString)
		t.addMany([]int{0x98, 0x9e, 0x9f}, state, actionIgnore, stateSosPmApcString)
		t.add(0x9b, state, actionClear, stateCsiEntry)
		t.add(0x90, state, actionClear, stateDcsEntry)
	}

	t.addMany(executables, stateGround, actionExecute, stateGround)
	t.addMany(executables, stateEscape, actionExecute, stateEscape)
	t.add(0x7f, stateEscape, actionIgnore, stateEscape)
	t.addMany(executables, stateOscString, actionIgnore, stateOscString)
	t.addMany(executables, stateCsiEntry, actionExecute, stateCsiEntry)
	t.add(0x7f, stateCsiEntry, actionIgnore, stateCsiEntry)
	t.addMany(executables, stateCsiParam, actionExecute, stateCsiParam)
	t.add(0x7f, stateCsiParam, actionIgnore, stateCsiParam)
	t.addMany(executables, stateCsiIgnore, actionExecute, stateCsiIgnore)
	t.addMany(executables, stateCsiIntermediate, actionExecute, stateCsiIntermediate)
	t.add(0x7f, stateCsiIntermediate, actionIgnore, stateCsiIntermediate)
	t.addMany(executables, stateEscapeIntermediate, actionExecute, stateEscapeIntermediate)
	t.add(0x7f, stateEscapeIntermediate, actionIgnore, stateEscapeIntermediate)

	t.add(0x5d, stateEscape, actionOscStart, stateOscString)
	t.addRange(0x20, 0x7f, stateOscString, actionOscPut, stateOscString)
	t.add(0x7f, stateOscString, actionOscPut, stateOscString)
	t.addMany([]int{0x9c, 0x1b, 0x18, 0x1a, 0x07}, stateOscString, actionOscEnd, stateGround)
	t.addRange(0x1c, 0x20, stateOscString, actionIgnore, stateOscString)

	t.addMany([]int{0x58, 0x5e, 0x5f}, stateEscape, actionIgnore, stateSosPmApcString)
	t.addRange(0x20, 0x7f, stateSosPmApcString, actionIgnore, stateSosPmApcString)
	t.addMany(executables, stateSosPmApcString, actionIgnore, stateSosPmApcString)
	t.add(0x9c, stateSosPmApcString, actionIgnore, stateGround)
	t.add(0x7f, stateSosPmApcString, actionIgnore, stateSosPmApcString)

	t.add(0x5b, stateEscape, actionClear, stateCsiEntry)
	t.addRange(0x40, 0x7f, stateCsiEntry, actionCsiDispatch, stateGround)
	t.addRange(0x30, 0x3c, stateCsiEntry, actionParam, stateCsiParam)
	t.addMany([]int{0x3c, 0x3d, 0x3e, 0x3f}, stateCsiEntry, actionCollect, stateCsiParam)
	t.addRange(0x30, 0x3c, stateCsiParam, actionParam, stateCsiParam)
	t.addRange(0x40, 0x7f, stateCsiParam, actionCsiDispatch, stateGround)
	t.addMany([]int{0x3c, 0x3d, 0x3e, 0x3f}, stateCsiParam, actionIgnore, stateCsiIgnore)
	t.addRange(0x20, 0x40, stateCsiIgnore, actionIgnore, stateCsiIgnore)
	t.add(0x7f, stateCsiIgnore, actionIgnore, stateCsiIgnore)
	t.addRange(0x40, 0x7f, stateCsiIgnore, actionIgnore, stateGround)
	t.addRange(0x20, 0x30, stateCsiEntry, actionCollect, stateCsiIntermediate)
	t.addRange(0x20, 0x30, stateCsiIntermediate, actionCollect, stateCsiIntermediate)
	t.addRange(0x30, 0x40, stateCsiIntermediate, actionIgnore, stateCsiIgnore)
	t.addRange(0x40, 0x7f, stateCsiIntermediate, actionCsiDispatch, stateGround)
	t.addRange(0x20, 0x30, stateCsiParam, actionCollect, stateCsiIntermediate)

	t.addRange(0x20, 0x30, stateEscape, actionCollect, stateEscapeIntermediate)
	t.addRange(0x20, 0x30, stateEscapeIntermediate, actionCollect, stateEscapeIntermediate)
	t.addRange(0x30, 0x7f, stateEscapeIntermediate, actionEscDispatch, stateGround)
	t.addRange(0x30, 0x50, stateEscape, actionEscDispatch, stateGround)
	t.addRange(0x51, 0x58, stateEscape, actionEscDispatch, stateGround)
	t.addMany([]int{0x59, 0x5a, 0x5c}, stateEscape, actionEscDispatch, stateGround)
	t.addRange(0x60, 0x7f, stateEscape, actionEscDispatch, stateGround)

	t.add(0x50, stateEscape, actionClear, stateDcsEntry)
	t.addMany(executables, stateDcsEntry, actionIgnore, stateDcsEntry)
	t.add(0x7f, stateDcsEntry, actionIgnore, stateDcsEntry)
	t.addRange(0x1c, 0x20, stateDcsEntry, actionIgnore, stateDcsEntry)
	t.addRange(0x20, 0x30, stateDcsEntry, actionCollect, stateDcsIntermediate)
	t.addRange(0x30, 0x3c, stateDcsEntry, actionParam, stateDcsParam)
	t.addMany([]int{0x3c, 0x3d, 0x3e, 0x3f}, stateDcsEntry, actionCollect, stateDcsParam)
	t.addMany(executables, stateDcsIgnore, actionIgnore, stateDcsIgnore)
	t.addRange(0x20, 0x80, stateDcsIgnore, actionIgnore, stateDcsIgnore)
	t.addRange(0x1c, 0x20, stateDcsIgnore, actionIgnore, stateDcsIgnore)
	t.addMany(executables, stateDcsParam, actionIgnore, stateDcsParam)
	t.add(0x7f, stateDcsParam, actionIgnore, stateDcsParam)
	t.addRange(0x1c, 0x20, stateDcsParam, actionIgnore, stateDcsParam)
	t.addRange(0x30, 0x3c, stateDcsParam, actionParam, stateDcsParam)
	t.addMany([]int{0x3c, 0x3d, 0x3e, 0x3f}, stateDcsParam, actionIgnore, stateDcsIgnore)
	t.addRange(0x20, 0x30, stateDcsParam, actionCollect, stateDcsIntermediate)
	t.addMany(executables, stateDcsIntermediate, actionIgnore, stateDcsIntermediate)
	t.add(0x7f, stateDcsIntermediate, actionIgnore, stateDcsIntermediate)
	t.addRange(0x1c, 0x20, stateDcsIntermediate, actionIgnore, stateDcsIntermediate)
	t.addRange(0x20, 0x30, stateDcsIntermediate, actionCollect, stateDcsIntermediate)
	t.addRange(0x30, 0x40, stateDcsIntermediate, actionIgnore, stateDcsIgnore)
	t.addRange(0x40, 0x7f, stateDcsIntermediate, actionDcsHook, stateDcsPassthrough)
	t.addRange(0x40, 0x7f, stateDcsParam, actionDcsHook, stateDcsPassthrough)
	t.addRange(0x40, 0x7f, stateDcsEntry, actionDcsHook, stateDcsPassthrough)
	t.addMany(executables, stateDcsPassthrough, actionDcsPut, stateDcsPassthrough)
	t.addRange(0x20, 0x7f, stateDcsPassthrough, actionDcsPut, stateDcsPassthrough)
	t.add(0x7f, stateDcsPassthrough, actionIgnore, stateDcsPassthrough)
	t.addMany([]int{0x1b, 0x9c, 0x18, 0x1a}, stateDcsPassthrough, actionDcsUnhook, stateGround)

	t.add(nonASCIIPrintable, stateGround, actionPrint, stateGround)
	t.add(nonASCIIPrintable, stateOscString, actionOscPut, stateOscString)
	t.add(nonASCIIPrintable, stateCsiIgnore, actionIgnore, stateCsiIgnore)
	t.add(nonASCIIPrintable, stateDcsIgnore, actionIgnore, stateDcsIgnore)
	t.add(nonASCIIPrintable, stateDcsPassthrough, actionDcsPut, stateDcsPassthrough)

	return t
}

// params holds a control sequence's numeric parameters, with ':' separated
// sub-parameters attached to the parameter they follow. A sub-parameter left
// empty is -1.
type params struct {
	values    []int32
	subs      []int32
	subStart  []int // index into subs where each value's sub-parameters begin
	subEnd    []int
	digitSub  bool
	rejectAll bool
	rejectSub bool
}

func newParams() params {
	return params{
		values:   make([]int32, 0, maxParams),
		subs:     make([]int32, 0, maxSubParams),
		subStart: make([]int, 0, maxParams),
		subEnd:   make([]int, 0, maxParams),
	}
}

func (p *params) reset() {
	p.values = p.values[:0]
	p.subs = p.subs[:0]
	p.subStart = p.subStart[:0]
	p.subEnd = p.subEnd[:0]
	p.digitSub = false
	p.rejectAll = false
	p.rejectSub = false
}

func (p *params) addParam(v int32) {
	p.digitSub = false

	if len(p.values) >= maxParams {
		p.rejectAll = true

		return
	}

	p.subStart = append(p.subStart, len(p.subs))
	p.subEnd = append(p.subEnd, len(p.subs))
	p.values = append(p.values, v)
}

func (p *params) addSubParam(v int32) {
	p.digitSub = true

	if len(p.values) == 0 {
		return
	}

	if p.rejectAll || len(p.subs) >= maxSubParams {
		p.rejectSub = true

		return
	}

	p.subs = append(p.subs, v)
	p.subEnd[len(p.values)-1]++
}

func (p *params) addDigit(d int32) {
	if p.rejectAll || (p.digitSub && p.rejectSub) {
		return
	}

	store := p.values
	if p.digitSub {
		store = p.subs
	}

	if len(store) == 0 {
		return
	}

	cur := store[len(store)-1]
	if cur == -1 {
		store[len(store)-1] = d

		return
	}

	next := int64(cur)*10 + int64(d)
	if next > maxParamVal {
		next = maxParamVal
	}

	store[len(store)-1] = int32(next)
}

func (p *params) length() int {
	return len(p.values)
}

// at returns parameter i, or 0 when it is absent.
func (p *params) at(i int) int {
	if i >= len(p.values) {
		return 0
	}

	return int(p.values[i])
}

// atOrOne returns parameter i, or 1 when it is absent or zero (the default
// of every count and position parameter).
func (p *params) atOrOne(i int) int {
	if v := p.at(i); v != 0 {
		return v
	}

	return 1
}

func (p *params) hasSubParams(i int) bool {
	return i < len(p.values) && p.subEnd[i] > p.subStart[i]
}

func (p *params) subParams(i int) []int32 {
	if !p.hasSubParams(i) {
		return nil
	}

	return p.subs[p.subStart[i]:p.subEnd[i]]
}

// sequenceHandler receives what the parser recognises.
type sequenceHandler interface {
	print(data []rune)
	execute(code rune)
	csiDispatch(collect int, final rune, p *params)
	escDispatch(collect int, final rune)
	oscDispatch(id int, data string)
	resetJoinState()
}

// parser turns code points into handler calls. It keeps its state between
// calls, so a sequence may arrive in any number of pieces.
type parser struct {
	table   *transitionTable
	state   parserState
	collect int
	params  params
	handler sequenceHandler

	oscID      int
	oscIDDone  bool
	oscAborted bool
	oscData    []rune
}

func newParser(handler sequenceHandler) *parser {
	p := &parser{
		table:   newTransitionTable(),
		params:  newParams(),
		handler: handler,
	}
	p.reset()

	return p
}

func (p *parser) reset() {
	p.state = stateGround
	p.clear()
	p.oscReset()
}

func (p *parser) clear() {
	p.params.reset()
	p.params.addParam(0)
	p.collect = 0
}

func (p *parser) oscReset() {
	p.oscID = -1
	p.oscIDDone = false
	p.oscAborted = false
	p.oscData = p.oscData[:0]
}

func isPrintEnd(code rune) bool {
	return code < 0x20 || (code > 0x7e && code < nonASCIIPrintable)
}

func isOscPutEnd(code rune) bool {
	return code < 0x20 || (code > 0x7f && code < nonASCIIPrintable)
}

func isDcsPutEnd(code rune) bool {
	return code == 0x18 || code == 0x1a || code == 0x1b || (code > 0x7f && code < nonASCIIPrintable)
}

// parse feeds decoded code points through the state machine.
func (p *parser) parse(data []rune) {
	for i := 0; i < len(data); i++ {
		code := data[i]

		lookup := code
		if lookup >= nonASCIIPrintable {
			lookup = nonASCIIPrintable
		}

		transition := p.table[int(p.state)<<8|int(lookup)]
		next := parserState(transition & 0x0F)

		switch parserAction(transition >> 4) {
		case actionPrint:
			j := i + 1
			for j < len(data) && !isPrintEnd(data[j]) {
				j++
			}

			p.handler.print(data[i:j])
			i = j - 1
		case actionExecute:
			p.handler.execute(code)
			p.handler.resetJoinState()
		case actionIgnore, actionError:
		case actionCsiDispatch:
			p.handler.csiDispatch(p.collect, code, &p.params)
			p.handler.resetJoinState()
		case actionParam:
			for {
				switch code {
				case ';':
					p.params.addParam(0)
				case ':':
					p.params.addSubParam(-1)
				default:
					p.params.addDigit(code - '0')
				}

				if i+1 >= len(data) || data[i+1] <= 0x2f || data[i+1] >= 0x3c {
					break
				}

				i++
				code = data[i]
			}
		case actionCollect:
			p.collect = p.collect<<8 | int(code)
		case actionEscDispatch:
			p.handler.escDispatch(p.collect, code)
			p.handler.resetJoinState()
		case actionClear:
			p.clear()
		case actionDcsHook:
		case actionDcsPut:
			j := i + 1
			for j < len(data) && !isDcsPutEnd(data[j]) {
				j++
			}

			i = j - 1
		case actionDcsUnhook:
			if code == 0x1b {
				next = stateEscape
			}

			p.clear()
			p.handler.resetJoinState()
		case actionOscStart:
			p.oscReset()
		case actionOscPut:
			j := i + 1
			for j < len(data) && !isOscPutEnd(data[j]) {
				j++
			}

			p.oscPut(data[i:j])
			i = j - 1
		case actionOscEnd:
			if code != 0x18 && code != 0x1a {
				p.oscEnd()
			}

			p.oscReset()

			if code == 0x1b {
				next = stateEscape
			}

			p.clear()
			p.handler.resetJoinState()
		}

		p.state = next
	}
}

func (p *parser) oscPut(data []rune) {
	for k, code := range data {
		if p.oscAborted {
			return
		}

		if p.oscIDDone {
			if len(p.oscData)+len(data)-k > maxOscLength {
				p.oscAborted = true

				return
			}

			p.oscData = append(p.oscData, data[k:]...)

			return
		}

		switch {
		case code == ';':
			p.oscIDDone = true
		case code >= '0' && code <= '9':
			if p.oscID == -1 {
				p.oscID = 0
			}

			p.oscID = p.oscID*10 + int(code-'0')
		default:
			p.oscAborted = true
		}
	}
}

func (p *parser) oscEnd() {
	if p.oscAborted || p.oscID == -1 {
		return
	}

	p.handler.oscDispatch(p.oscID, string(p.oscData))
}

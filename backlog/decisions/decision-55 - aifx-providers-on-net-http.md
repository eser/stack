---
id: decision-55
title: aifx providers on net/http
date: '2026-10-24 00:20'
status: accepted
---

## Context

aifx reaches Anthropic, OpenAI, Gemini and Vertex AI through the vendor SDKs (anthropic-sdk-go, openai-go, google.golang.org/genai, which pulls in gRPC, protobuf and Google auth). The WASM profile spike measured that chain at 26.3 MB of the 38.6 MB darwin/arm64 bridge dylib: without it the dylib is 12.3 MB (3.6 MB brotli instead of 7.75 MB), and every ajan-* platform package carries the same weight. The SDKs are HTTP clients over JSON and SSE, so the calls aifx makes can be written on net/http. The SDK init also costs about 1 ms of native load time.

## Options

- Keep the vendor SDKs
- Split AI into an optional second native library
- Implement the providers on net/http inside aifx and drop the vendor SDKs

## Decision

Implement the providers on net/http in aifx (TASK-279). Each provider keeps the options, tool calls, streaming and error mapping aifx exposes today, tested against recorded fixtures. The vendor SDK modules leave both go.mod files. Because the providers then need only net/http, AI can later join the WASM profile through the host fetch import (TASK-277) if its size cost is accepted.

## Decided by

The owner chose net/http on 2026-10-24.

## Blocks

TASK-279 (M6-T5), TASK-268 (M6-T2)

Plan key: `aifx-net-http`

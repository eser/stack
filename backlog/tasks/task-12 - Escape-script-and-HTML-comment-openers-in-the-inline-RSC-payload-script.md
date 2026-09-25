---
id: TASK-12
title: Escape </script and HTML comment openers in the inline RSC payload script
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - laroux-server
dependencies: []
references:
  - pkg/@eserstack/laroux-server/adapters/react/mod.ts
  - pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts
  - pkg/@eserstack/laroux-react/protocol.ts
  - pkg/@eserstack/laroux-server/adapters/react/inline-rsc-emitter.ts
  - security-report.md
priority: medium
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: medium (likelihood low, impact high). Fingerprint: laroux-server/adapters/react/inline-rsc-emitter/unescaped-json-in-executing-script. Full record, bounded reproduction and proposed code are in security-report.md.

chunkToInlineScript in pkg/@eserstack/laroux-server/adapters/react/inline-rsc-emitter.ts wraps JSON.stringify(chunk) directly in <script>self.__RSC_CHUNK__(...)</script>. JSON.stringify leaves < and / untouched, so any RSC chunk whose value contains </script closes the script element early and the remainder of the value is parsed as HTML in the consuming page's origin. Server-component text and string props become J chunk values verbatim (verified end to end: createInlineRSCStream on a <div title={s}>{s}</div> tree emits both copies of s raw inside the executing script), so a page that renders a request- or store-derived string through createInlineRSCStream emits attacker markup. The helpers are part of the package's public ./adapters/react export and the shipped client (laroux-react/client.ts:1581) installs the matching __RSC_CHUNK__ consumer, but no HTTP handler inside laroux-server calls them, so the path is reachable only for consumers of that API.

Root cause: inline-rsc-emitter.ts builds an executable script body from JSON without the script-context escaping (< to \u003c, U+2028/U+2029) that JSON-in-script embedding requires; the other embedding sites in the package (ssr-renderer.ts:750, runtime/server.ts:105) at least replace </script, this one replaces nothing.

Intended behaviour: Every RSC chunk embedded in HTML is encoded so that no byte sequence in a chunk value can end the script element or change how the page parses; the emitter is safe for arbitrary string values by construction.

Trace:
1. entrypoint pkg/@eserstack/laroux-server/adapters/react/mod.ts:57 (adapters/react/mod.ts re-exports (package export ./adapters/react, package.json:10, deno.json:8)): A consumer imports createInlineRSCStream / createInlineTransformStream / chunkToInlineScript and streams a React tree whose server components render strings taken from the request or a data store.
2. propagation pkg/@eserstack/laroux-server/adapters/react/rsc-flight-renderer.ts:93 (renderElement): A primitive string in the tree becomes a J chunk with the string as its value verbatim; renderProps (368-371) inlines string props the same way. Verified locally: a div with the payload as title prop and child emitted a J chunk carrying both strings unchanged.
3. propagation pkg/@eserstack/laroux-react/protocol.ts:68 (serializeChunk): The chunk is serialized as `${type}${id}:${JSON.stringify(value)}\n`; JSON.stringify leaves < / ! - untouched, and parseChunk (74-95) JSON.parses the value back so it round-trips verbatim.
4. propagation pkg/@eserstack/laroux-server/adapters/react/inline-rsc-emitter.ts:74 (createInlineTransformStream.transform): Each wire line is passed to chunkToInlineScript and the result is enqueued into the HTML body stream (createInlineRSCStream, 111-115). Verified locally by writing the wire line as bytes into the transform stream.
5. sink pkg/@eserstack/laroux-server/adapters/react/inline-rsc-emitter.ts:44 (chunkToInlineScript): return `<script>self.__RSC_CHUNK__(${chunkJson})</script>` with chunkJson = JSON.stringify(chunk) (line 43) and no escaping; a value containing </script> terminates the element and the rest is parsed as markup.

Conditions:
- system_configuration: The consuming application must use the exported createInlineRSCStream / createInlineTransformStream / chunkToInlineScript API to stream RSC chunks into its HTML; laroux-server's own runtime handlers do not call it.
- data_state: A server component reached through that stream must render a string (text child or string prop) containing </script that an attacker controls (route parameter, stored content or similar).
- user_interaction: A victim loads the page that embeds the affected chunk.

Observed in the audit sandbox: SINK: <script>self.__RSC_CHUNK__({"type":"J","id":5,"value":"</script><img src=x onerror=alert(1)>"})</script> with two </script occurrences (first at index 55, intended closer at 95); the text after the early close is <img src=x onerror=alert(1)>"}). TRANSFORM: identical output from createInlineTransformStream. FULL: createInlineRSCStream on a div with the payload as title prop and child emitted <script>self.__RSC_CHUNK__({"type":"J","id":1,"value":{"title":"</script><img src=x onerror=alert(1)>","children":"</script><img src=x onerror=alert(1)>"}})</script> followed by the element chunk, two raw </script><img occurrences. CONTROL: generateRSCPayloadScript emitted <\/script><img ... with exactly one </script. Node v26.7.0, exit 0, environment limited to HOME, NODE_OPTIONS, NODE_VERSION, PATH, PWD, TMPDIR.

Fix strategy: Escape the JSON for script context before interpolation (replace < > & with \u003c \u003e \u0026 and U+2028/U+2029 with their escapes); the result is still a valid JS object literal, so the client's __RSC_CHUNK__ handler is unchanged. Escaping < also neutralizes <!-- inside the value. Add a regression test asserting chunkToInlineScript('J5:"</script><b>"') contains exactly one </script sequence (its own closing tag) and that createInlineRSCStream on an element with a </script string child produces the same property.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: Every RSC chunk embedded in HTML is encoded so that no byte sequence in a chunk value can end the script element or change how the page parses; the emitter is safe for arbitrary string values by construction.
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/laroux-server/adapters/react/inline-rsc-emitter.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
New adapters/react/script-json.ts exports escapeJsonForScript, which turns < > & into \u003c \u003e \u0026 and U+2028/U+2029 into escapes. The result is still valid JSON and a valid JS expression, so the client handlers are unchanged. chunkToInlineScript (the reported sink) now escapes every chunk, and the four other JSON-in-script sites that only replaced </script now use the same helper: generateRSCPayloadScript (ssr-renderer.ts), both chunk-manifest scripts in html-shell.ts, and the sync-chunk payload in runtime/server.ts. That also covers <!-- inside a type=application/json payload. Regression: adapters/react/script-json.test.ts (round-trip, one </script per element and no <!-- for chunkToInlineScript, createInlineRSCStream on a div whose title prop and child carry the payload, generateRSCPayloadScript). Three of its four tests fail on the committed emitter and renderer and all pass now.
<!-- SECTION:NOTES:END -->

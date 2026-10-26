---
id: TASK-21
title: Strip terminal control sequences from text spans in the streams renderers
status: Done
assignee: []
created_date: '2026-09-25 00:26'
updated_date: '2026-09-25 01:12'
labels:
  - security
  - streams
  - posts
dependencies: []
references:
  - pkg/@eserstack/posts/adapters/bluesky/mappers.ts
  - pkg/@eserstack/posts/adapters/bluesky/social-api.ts
  - pkg/@eserstack/posts/adapters/cli/commands/timeline.ts
  - pkg/@eserstack/posts/adapters/cli/output.ts
  - pkg/@eserstack/posts/adapters/tui/menu.ts
  - pkg/@eserstack/streams/output.ts
  - pkg/@eserstack/streams/renderers/ansi.ts
  - pkg/@eserstack/streams/sinks/stdout.ts
  - security-report.md
priority: low
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Security audit finding (run stack-run-1, ref f7394953). Severity: low (likelihood medium, impact low). Fingerprint: streams/renderers/ansi/text-span-control-passthrough. Full record, bounded reproduction and proposed code are in security-report.md.

A Bluesky or X post that appears in the operator's timeline, in `eser posts search` results or in their bookmarks can carry terminal control sequences in its text. `eser posts timeline|search|bookmarks` and the interactive `eser posts` TUI timeline/search/bookmarks views write that text to stdout through @eserstack/streams' ansi renderer. The renderer copies text spans byte-for-byte and only appends an SGR reset. The operator's terminal then interprets the attacker's sequences: CSI cursor movement and erase (rewriting or hiding earlier feed lines, such as a fake system message in place of the previous post header), OSC 8 hyperlinks whose visible label differs from their target, OSC 52 clipboard writes on emulators that allow them, DCS strings, BEL and CR overwrites. Two independent bounded renders of dummy posts through the real output()+ansi() pipeline, in the CLI and TUI span shapes, reproduced the bytes unchanged.

Root cause: pkg/@eserstack/streams/renderers/ansi.ts:49-50 returns `span.value` verbatim for text spans, and ansi.ts:70-73 does the same for each code-block line. span.ts:109-116 and output.ts:137-141 never inspect string content, and sinks/stdout.ts:20-25 encodes and writes whatever it receives, with no TTY check. The only defensive code is ansi.ts:163-165. It appends ESC[0m when the output contains ESC[, which does not neutralise cursor, erase, OSC, DCS or C0/C1 controls, and attacker bytes trigger it too. posts/adapters/cli/output.ts:43 and posts/adapters/tui/menu.ts:579/1029/1069 pass remote Post.text into that renderer. Post.text is copied unfiltered from the provider response at bluesky/mappers.ts:26 and twitter/mappers.ts:56.

Intended behaviour: Text spans are data, not markup. Only the renderer should emit escape sequences, and an untrusted string in a text span should render as visible characters only: every ESC-introduced sequence and every C0/C1 control other than newline and tab is removed or made visible. Remote content then cannot move the cursor, rewrite earlier lines, spoof links or write the clipboard.

Trace:
1. entrypoint pkg/@eserstack/posts/adapters/bluesky/mappers.ts:26 (mapToDomainPost): `text: raw.record.text` copies a remote author's post body verbatim into Post.text. twitter/mappers.ts:56 does the same with `raw.text`. There is no character filtering.
2. propagation pkg/@eserstack/posts/adapters/bluesky/social-api.ts:108 (BlueskySocialApi.getTimeline): Feed items are mapped and returned unchanged. searchPosts (bluesky:371) and the Twitter timeline (110), search (320) and bookmarks (367) paths behave the same, so any public post matching a search query is included.
3. propagation pkg/@eserstack/posts/adapters/cli/commands/timeline.ts:46 (main): `await output.outputPosts(postsResult.value)`. search.ts:57 and bookmarks.ts:47 call the same helper with remote posts.
4. propagation pkg/@eserstack/posts/adapters/cli/output.ts:43 (outputPosts): `out.writeln(post.text)` on an Output built unconditionally at lines 14-18 with streams.renderers.ansi() and streams.sinks.stdout(). There is no isatty check or plain fallback.
5. propagation pkg/@eserstack/posts/adapters/tui/menu.ts:579 (TuiMenu.timelineFlow): Parallel TUI path: `this.ctx.output.writeln(span.text(`  ${post.text}`))`. ctx defaults to tui.createTuiContext() (menu.ts:65), which selects ansi()+stdout() for interactive use (shell/tui/types.ts:89-93). searchFlow (1029) and viewBookmarksFlow (1069) repeat the same line.
6. propagation pkg/@eserstack/streams/output.ts:139 (output().writeln): `renderer.render(spans) + "\n"`, where spans = normalize(args) (span.ts:109-110), which wraps a bare string as a text span without inspection.
7. propagation pkg/@eserstack/streams/renderers/ansi.ts:50 (renderSpan case "text"): `return span.value;` concatenates attacker bytes into the ANSI stream. The only transformation is at line 165, which appends ESC[0m.
8. sink pkg/@eserstack/streams/sinks/stdout.ts:25 (stdout().writable.write): `await writer.write(bytes)` writes TextEncoder.encode(String(chunk.data)) to runtime.process.stdout, and the terminal emulator interprets the embedded sequences.

Conditions:
- authentication_level: The attacker needs only an ordinary Bluesky or X account. The operator must be logged in via `eser posts login` so a feed, search or bookmark list can be fetched.
- user_interaction: The operator runs `eser posts timeline`, `eser posts search <query>` or `eser posts bookmarks`, or opens the TUI timeline/search/bookmarks view, in a terminal. For search, any public post matching the query is enough. For timeline, the attacker must be followed or reposted into the feed. For bookmarks, the operator must have bookmarked the post.
- third_party_dependency: The provider must deliver the control bytes in the post text. Bluesky record text and X tweet text arrive as JSON strings and the client does not filter them; whether a given provider strips C0/ESC server-side is not visible in source and was not tested against live services.
- environmental_dependency: The effect depends on the terminal emulator. Every ANSI terminal honours CSI cursor movement, erase and SGR. Most modern emulators honour OSC 8. OSC 52 clipboard writes work only where enabled (xterm allowWindowOps, kitty/foot/WezTerm/tmux settings). 8-bit C1 bytes arrive UTF-8 encoded, and most UTF-8 terminals ignore them. Output must go to a TTY.

Observed in the audit sandbox: Exit 0. stdout: {"cli_line_verbatim":true,"tui_line_verbatim":true,"csi_cursor_up_2":true,"csi_erase_display":true,"osc52":true,"osc8":true,"dcs":true,"c1_csi_0x9b":true,"cr":true,"bel":true,"total_bytes":321}. Escaped CLI post line: `v38 <1b>[2A<1b>[J<1b>]52;c;djM4LWR1bW15<07><1b>]8;;https://attacker.invalid<1b>\docs.example<1b>]8;;<1b>\<1b>P+q<1b>\<9b>31m<0d>FAKE<07><1b>[0m`. The TUI line is identical after a two-space prefix. The renderer added only the trailing ESC[0m. This matches the hunter's independent artifact (render.bin, 277 bytes, OSC 52/CSI 1A/CSI 2K at 0x50-0x73).

Fix strategy: Treat text spans as untrusted data in the renderer. In both the ansi and plain renderers, strip ESC-introduced sequences (CSI, OSC, DCS/SOS/PM/APC, two-byte ESC), C0 controls other than \n and \t, DEL and C1 controls before concatenating span.value and code-block lines. This covers every consumer of @eserstack/streams at once. As defence in depth, posts/adapters/cli/output.ts can also sanitise post.text and post.id, and choose the plain renderer when stdout is not a TTY. Add regression tests in pkg/@eserstack/streams/span.test.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The invariant holds in code: Text spans are data, not markup. Only the renderer should emit escape sequences, and an untrusted string in a text span should render as visible characters only: every ESC-introduced sequence and every C0/C1 control other than newline and tab is removed or made visible. Remote content then cannot move the cursor, rewrite earlier lines, spoof links or write the clipboard.
- [x] #2 A regression test reproduces the audit input from security-report.md and fails on the current code, then passes after the fix
- [x] #3 The change stays within the files the fix needs (expected: pkg/@eserstack/streams/span.ts, pkg/@eserstack/streams/renderers/ansi.ts, pkg/@eserstack/streams/renderers/plain.ts, pkg/@eserstack/streams/span.test.ts, pkg/@eserstack/posts/adapters/cli/output.ts); any wider change is noted in the implementation notes
- [x] #4 deno task cli ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed at the untrusted boundary, not by stripping every text span. The TUI deliberately sends cursor control through span.text (shell/tui/keypress.ts hideCursor/clearLine, used by every prompt), so renderer-level stripping would break prompts. New in pkg/@eserstack/streams/span.ts: stripTerminalControls (removes CSI, OSC ending in BEL or ST, DCS/SOS/PM/APC, two-byte ESC forms, 8-bit CSI/OSC, C0 except tab and newline, DEL, and C1) and untrusted(value), a text span that strips first. Both are exported, and span.text stays verbatim by design, as documented on untrusted. Applied to every remote field that is printed: posts CLI outputPost/outputPosts (post.text, post.id), and the posts TUI timeline, search, bookmarks and reply views (post.text, authorHandle; three feed views plus the reply preview). Also applied to the second consumer the critic named: eser kit list registry strings (manifest name and description; recipe name, description and language). Regression: streams/untrusted-text.test.ts (exact stripping result for the audit payload, the untrusted span through the plain and ansi pipelines, span.text still verbatim) and posts/adapters/cli/output.test.ts (runs outputPosts in a child process and asserts that its real stdout carries no control bytes beyond the renderer's own SGR). The output test fails on the committed output.ts and passes now. Not covered: provider error messages echoed through tui.log.error; those are formatted strings, not post content.
<!-- SECTION:NOTES:END -->

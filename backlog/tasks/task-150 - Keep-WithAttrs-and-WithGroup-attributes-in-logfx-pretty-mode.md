---
id: TASK-150
title: Keep WithAttrs and WithGroup attributes in logfx pretty mode
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - logfx
  - bug
dependencies: []
references:
  - pkg/ajan/logfx/handler.go
priority: medium
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Handle in pkg/ajan/logfx/handler.go:161 writes PrettifyMessage(rec) (line 116) when PrettyMode is on, and that output holds only the record's own attributes. Attributes and groups added through WithAttrs and WithGroup (lines 182-205) live only in InnerHandler, so logger.With("request_id", id) prints just the message. PrettyMode defaults to true, so request and trace ids are lost in development output. Rule: coding-practices: Structured Logging.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Handler tracks the added attributes and group prefix and PrettifyMessage prints them
- [x] #2 A test with a handler derived through WithAttrs and WithGroup checks the output
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

go-libs: Checked /Users/eser/projects/eser/stack/pkg/ajan/logfx/handler.go. Handler.groupPrefix and Handler.attrs are filled by WithAttrs and WithGroup through derive. slices.Clip keeps sibling handlers from sharing storage. appendQualifiedAttrs follows the slog.Handler rules. PrettifyMessage and the subscriber record both use qualifiedAttrs, and JSON mode still goes through the inner slog.JSONHandler. Tests: TestHandler_PrettyModeKeepsDerivedAttrs, TestHandler_PrettyModeDerivedHandlersStayApart, TestHandler_EmptyDerivationsReturnTheSameHandler, TestLogger_PrettyModeWith and TestHandler_SubscribersReceiveDerivedAttrs all pass. The README section 'Attributes and Groups' matches the code. I added a reason to one new nolint in handler_test.go.
<!-- SECTION:NOTES:END -->

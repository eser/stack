---
id: decision-26
title: Go dependencies for the CLI framework and prompts
date: '2026-10-15 20:38'
status: accepted
---

## Context

pkg/ajan has no CLI framework; noskills-server uses flag and a switch. The TUI prompts are about 5k TS lines. go.mod has lipgloss but no prompt library.

## Options

- An in-house flag-based clifx plus one vetted prompt library from the charmbracelet family
- Everything in-house
- cobra plus bubbletea

## Recommendation

An in-house clifx with no global state, plus one vetted prompt dependency.

## Decided by

The owner accepted the recommendation on 2026-10-15.


## Chosen dependency

2026-10-24 (TASK-242): `charm.land/huh/v2` v2.0.3, pinned in the root go.mod. Vetting: MIT license (Charm), released 2026-03-10, 25 modules and 40 non-standard packages, nearly all from the charmbracelet family that lipgloss v2 already brings in (bubbletea v2, bubbles v2, x/ansi, ultraviolet), plus atotto/clipboard, catppuccin, dustin/go-humanize, mitchellh/hashstructure, rivo/uniseg and golang.org/x/sync and x/sys. clifx wraps it, so no other package imports huh.

## Blocks

TASK-242 (M3-T1)

Plan key: `go-cli-deps`

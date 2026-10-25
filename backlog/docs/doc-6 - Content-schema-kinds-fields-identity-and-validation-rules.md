---
id: doc-6
title: 'Content schema: kinds, fields, identity and validation rules'
type: specification
created_date: '2026-10-25 13:42'
---

# Content schema: kinds, fields, identity and validation rules

This document is the schema specification for the records in `content/` (TASK-342). It is written for whoever builds the `@eserstack/content` package, the content validators and the persona commands (TASK-344 to TASK-352), and for the owner, who has to read it before TASK-342 is done. It turns decision-65 into exact rules: the fields of each kind, the slug and shortcut grammar, the status values, the reserved command names, the sensitive-data patterns and the translation file names.

Status: a proposal waiting for the owner's read. Everything the decisions did not settle is listed in [Open Questions](#open-questions) with a recommended answer; the rules in the body follow those recommendations until the owner answers.

## What the Decisions Already Settle

These parts are decided and are restated here only so the rules below have a reference. Change them in the decision record, not here.

- Layout: records live in `content/<year>/` and synced records in `content/_synced/<year>/`; the folder year is the year in the slug, and browsing by kind is a command, not a folder ([decision-65](../decisions/decision-65%20-%20Content-layout-format-and-identity.md)).
- Format: one Markdown file per record, structured fields in YAML frontmatter, prose in the body (decision-65).
- Shared fields: `kind`, `title`, `summary`, `lang`, `status`, `visibility` and `updated` are required; `shortcut`, `tags`, `refs` and `translation_of` are optional (decision-65).
- Identity: every slug starts with the record's creation date, which never changes; a `shortcut` maps a plain name to a slug; `refs` and `eser <name>` accept either (decision-65).
- Review intervals: 6 months for `bio` and `project`, 12 months for `experience`, `approach`, `channel` and `profile`, none for `article`, `video` and `social`; the gate never fails on staleness (decision-65).
- Visibility: `public` or `unlisted`; `private` is rejected in this repository ([decision-66](../decisions/decision-66%20-%20Visibility-language-and-sensitive-data-in-the-content-layer.md)).
- Language: every record has `lang`, a translation is a separate file with `translation_of`, and `eser intro` answers in English by default (decision-66).
- Drafts: an AI writes `status: draft` only, the owner sets `published`, and drafts never reach the snapshot, the site, the feed or `llms.txt` ([decision-64](../decisions/decision-64%20-%20Source-of-truth-and-sync-for-personal-content.md), decision-65).
- Commands: `eser intro`, `eser <name>`, `eser content` and `eser sync` join the existing developer commands, and a reserved-name list keeps shortcuts off command names ([decision-67](../decisions/decision-67%20-%20The-eser-command-surface-for-the-persona.md)).
- Project landings: `cli:` makes `eser <name>` forward to a program, and `site: external` hands a subdomain to the project's own site ([decision-68](../decisions/decision-68%20-%20Delivery-hosting-and-agent-discovery-of-the-persona.md)).

## Directory Layout and File Names

Records sit in one folder per year. There are no other folders under `content/` and none below a year folder.

```text
content/
  2026/
    20260301-laroux.md          original record
    20261010-about.md           original record
    20261010-about.tr.md        Turkish translation of 20261010-about
  _synced/
    2026/
      20261101-building-a-cli-in-go.md
```

A record file name matches this pattern. The `lang` group is present only on a translation.

```text
^(?<slug>[0-9]{8}-[a-z0-9]+(?:-[a-z0-9]+)*)(?:\.(?<lang>[a-z]{2}))?\.md$
```

The validator applies these rules to the layout:

- The year folder is four digits and equals the first four digits of the slug (decision-65).
- A file that does not match the pattern is an error, so a stray `notes.md` or `README.md` under `content/` fails the gate.
- A slug is unique across `content/` and `content/_synced/`, so `content/2026/20261101-x.md` and `content/_synced/2026/20261101-x.md` cannot both exist.
- A translation sits in the same folder as its original.

Every record file name already matches the kebab-case pattern of `validate-filenames` (`pkg/@eserstack/codebase/validate-filenames.ts:53`), which checks base names only, so the `_synced` folder name does not trip it. TASK-348 still decides how that validator and the English check treat `content/`.

## Slug Grammar

The slug is the file name without the language suffix and the `.md` extension. Records do not repeat it in the frontmatter; the loader takes it from the file name.

```text
slug  = date "-" name
date  = YYYYMMDD, a real calendar date (the record's creation day, UTC)
name  = word *("-" word), at most 60 characters
word  = 1*(a-z / 0-9)
regex = ^(?<year>[0-9]{4})(?<month>0[1-9]|1[0-2])(?<day>0[1-9]|[12][0-9]|3[01])-(?<name>[a-z0-9]+(?:-[a-z0-9]+)*)$
```

The regex alone accepts `20260230`, so the validator also checks that the date exists on the calendar. The name is plain ASCII even when the record is in Turkish.

When a tool generates a slug name (`eser content add`, `eser sync`), it derives it from the title:

1. Lowercase the title.
2. Replace `ç`, `ğ`, `ı`, `ö`, `ş` and `ü` with `c`, `g`, `i`, `o`, `s` and `u`, then strip the marks from other accented Latin letters (Unicode NFKD, combining marks removed).
3. Turn every run of other characters into one hyphen and trim hyphens from both ends.
4. Cut the result to 60 characters at a hyphen.
5. When the slug is taken, append `-2`, then `-3`, and so on.

| Slug                            | Valid | Why                                        |
| ------------------------------- | ----- | ------------------------------------------ |
| `20261010-about`                | yes   |                                            |
| `20260301-laroux`               | yes   |                                            |
| `20261102-notes-on-small-clis`  | yes   |                                            |
| `20270115-10-tips`              | yes   | a name may start with a digit              |
| `2026-10-10-about`              | no    | the date has no separators                 |
| `261010-about`                  | no    | the date has eight digits                  |
| `20261310-about`                | no    | there is no month 13                       |
| `20260230-about`                | no    | February has no 30th                       |
| `20261010-About`                | no    | uppercase                                  |
| `20261010_about`                | no    | underscore                                 |
| `20261010-about-`               | no    | trailing hyphen                            |
| `20261010-a--b`                 | no    | empty word between hyphens                 |
| `20261010-çay`                  | no    | non-ASCII letter; the derived name is `cay` |
| `about`                         | no    | no date; this is a shortcut                |

## Shortcut Grammar and Resolution

A shortcut is a plain name that `eser <name>`, `eser intro --for <name>` and `refs` accept in place of a slug.

```text
shortcut = letter *(a-z / 0-9) *("-" 1*(a-z / 0-9)), 2 to 32 characters
regex    = ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$
```

A shortcut starts with a letter and a slug starts with a digit, so a resolver tells them apart by the first character and the two can never collide. The grammar also keeps a shortcut from reading as a flag (`-x`), which `cmd/eser/app.go` hands to the flag parser, or as a path (`../x`), which `cmd/eser/forward.go` rejects.

| Shortcut         | Valid | Why                                         |
| ---------------- | ----- | ------------------------------------------- |
| `about`          | yes   |                                             |
| `laroux`         | yes   | a reserved plugin name; see the plugin rule |
| `coding-agent`   | yes   |                                             |
| `pet-project2`   | yes   |                                             |
| `Laroux`         | no    | uppercase                                   |
| `la_roux`        | no    | underscore                                  |
| `-x`             | no    | reads as a flag                             |
| `2fa`            | no    | starts with a digit, reads as a slug        |
| `x`              | no    | shorter than 2 characters                   |
| `laroux-`        | no    | trailing hyphen                             |
| `a--b`           | no    | empty word between hyphens                  |
| `eser.dev`       | no    | dot                                         |
| `kit`            | no    | reserved command name                       |

The validator enforces these rules on shortcuts:

- A shortcut is unique among all records that are not drafts (`published` and `archived`). decision-65 says "published records"; an archived project keeps its shortcut so `eser <name>` still prints its card (open question 4).
- A translation carries no `shortcut`. It is reached through its original's shortcut and `--lang`.
- An `unlisted` record carries no `shortcut`, because the snapshot leaves unlisted records out and the shortcut would not resolve (open question 5).
- A `profile` record requires a shortcut, since `--for <name>` selects the profile by it.
- Lookup is exact. An unknown name gets the near-match error of TASK-346; the CLI does not fold case.

## Reserved Names

A shortcut must not equal a name in this table (decision-67). The list is the union of the Go `eser` binary and the TypeScript CLI as they are today, plus the persona commands, and aliases count as names. Names stay reserved after the TypeScript CLI retires, so a habit like `eser cb` never starts resolving to a record.

| Names                                              | Source in the repository                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `help`, `completion`                               | `cmd/eser/app.go` (`isBuiltin`; `__complete` is outside the grammar already)   |
| `version`, `install`, `update`, `uninstall`, `doctor` | `cmd/eser/app.go` (`builtinCommands`), `pkg/@eserstack/codebase/cli-support.ts` |
| `codebase`, `cb`                                   | `cmd/eser/codebase.go`, `pkg/@eserstack/cli/main.ts` (also `.`, outside the grammar) |
| `kit`, `cs`, `ai`, `dev`                           | `cmd/eser/app.go` (`builtinCommands`)                                          |
| `workflows`, `wf`, `ajan`, `system`                | `pkg/@eserstack/cli/main.ts`, `pkg/@eserstack/codebase/cli-support.ts`         |
| `noskills`, `nos`, `posts`, `laroux`               | `cmd/eser/forward.go` (`knownPlugins`), `pkg/@eserstack/cli/main.ts`           |
| `intro`, `content`, `sync`                         | decision-67                                                                    |
| `bio`, `experience`, `project`, `approach`, `article`, `video`, `social`, `channel`, `profile` | this spec: `eser intro <kind>` takes a kind name (open question 6) |

The plugin rule covers `laroux`, `noskills` and `posts`, the names `eser` forwards to another program today. A `project` record may take one of them as its shortcut when its `cli` names the program `cmd/eser/forward.go` runs for it (`laroux`, `noskills` or `eser-posts`). That keeps `eser laroux ...` forwarding (TASK-347 criterion 2) and the `npx eser@latest noskills` hooks working (decision-10). Every other record with one of these shortcuts is rejected, and `nos` stays reserved outright.

The names of `.eser/manifest.yml` scripts (`ok`, `fix`, `test`, `release` and others) are not in the table: they exist only where a manifest is, and `cmd/eser/app.go` runs them before any plugin. Open question 8 asks whether to reserve them too.

TASK-347 decides where the list lives. A test there fails when a built-in command or alias of the Go binary is missing from it, so a new command cannot slip past the validator.

## Shared Fields

Every record carries these fields. Keys are `snake_case`, and the loader rejects a key that neither this table nor the record's kind defines, so a typo fails the gate instead of being ignored.

| Field            | Required | Format                                                              | Rules                                                                                 |
| ---------------- | -------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `kind`           | yes      | one of the nine kind names                                          | equals the original's kind on a translation                                           |
| `title`          | yes      | one line, 1 to 120 characters                                       |                                                                                       |
| `summary`        | yes      | one or two sentences on one line, at most 280 characters            | what `eser intro` and `llms.txt` print before anyone opens the record (decision-65)   |
| `lang`           | yes      | ISO 639-1 code, two lowercase letters (`en`, `tr`)                  | equals the file name's suffix on a translation                                        |
| `status`         | yes      | `draft`, `published` or `archived`                                  | see [Status Values and the Project Lifecycle](#status-values-and-the-project-lifecycle) |
| `visibility`     | yes      | `public` or `unlisted`                                              | `private` is rejected (decision-66)                                                   |
| `updated`        | yes      | date                                                                | written by the precommit step; not earlier than the slug date                         |
| `shortcut`       | no       | shortcut grammar                                                    | see [Shortcut Grammar and Resolution](#shortcut-grammar-and-resolution)               |
| `tags`           | no       | list of 1 to 10 unique words, each `[a-z0-9]+(?:-[a-z0-9]+)*`, at most 32 characters | free, no fixed set (decision-65)                                  |
| `refs`           | no       | list of unique slugs or shortcuts                                   | each resolves; no self reference; a non-draft record does not point at a draft        |
| `translation_of` | no       | slug                                                                | only on a translation, and equal to the slug in its file name                         |

Field values use these formats:

- A date is `YYYY-MM-DD`. YAML reads an unquoted date as a date and a quoted one as a string; the loader accepts both and normalizes to the string.
- A month is `YYYY-MM` or `YYYY`. YAML reads `2019` as a number; the loader accepts that for a year.
- A URL is an absolute `https://` URL with no user name or password and no IP address as the host. Query parameters are allowed only where a field names them, so a tracking or share token never enters a record.
- A list is a YAML flow list (`[a, b]`) or a block list.
- Records carry no schema version. The package defines it, and `eser intro --format json` reports it as `schemaVersion` (decision-67).

The body is Markdown. Each kind says whether it needs one.

## Status Values and the Project Lifecycle

`status` is the record's editorial state, the same three values for every kind. `visibility` decides where a non-draft record is listed.

| `status`    | Meaning                                                              | In the snapshot, site, feed and `llms.txt`                       | Staleness check |
| ----------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------- |
| `draft`     | Written or proposed, not approved; the only value an AI or the sync writes for AI text | never                                          | no              |
| `published` | Approved by the owner and current                                    | when `public`; an `unlisted` record stays out (TASK-349)         | yes             |
| `archived`  | Kept for the record, no longer current: a stopped project, a closed channel, a retired approach | when `public`, marked archived (open question 3) | no              |

A record moves through these states:

1. `draft`: the owner writes it by hand, an AI proposes it, or the sync writes AI text (decision-64).
2. `published`: the owner sets it after review (`eser content review` lists drafts).
3. `archived`: the owner sets it when the record stops being current.

The owner may also move an archived record back to `published`, or a published one back to `draft`. The validator does not check transitions, because it has no history to compare against (the `updated` writer needs none either). That an AI never sets `published` is a review rule from decision-64, not a validator rule.

A project's maturity is a separate, optional field, `stage`, so the landing badge has something to show besides "published" (open question 1). Its values, in their usual order:

1. `experimental`: built to try an idea; may change or stop at any time.
2. `active`: under development.
3. `maintained`: stable; fixes and small changes only.
4. `paused`: no work for now, expected to resume.

An archived project carries no `stage`, and the badge reads "archived". decision-65 exempts an archived project from the staleness check; this spec exempts every archived record (open question 2).

## Review Intervals

The intervals are settled in decision-65. `eser content stale` lists a record when today is later than `updated` plus the interval, counted in calendar months, and `eser intro` marks it `stale: true`. The gate never fails on it.

| Kind         | Interval  |
| ------------ | --------- |
| `bio`        | 6 months  |
| `project`    | 6 months  |
| `experience` | 12 months |
| `approach`   | 12 months |
| `channel`    | 12 months |
| `profile`    | 12 months |
| `article`    | none      |
| `video`      | none      |
| `social`     | none      |

Drafts and archived records are not checked. A translation is checked against its own `updated`; open question 13 asks whether a translation older than its original is listed too.

## Kinds

Each kind below lists the fields it adds to the shared ones, the body it needs and one complete example record. Every value in the examples is fictional or generic, except the laroux record, which is the example from doc-4, and the approach record, which restates a rule from this repository's skills; none of them is a fact about the owner.

### bio

Who the owner is, in their own words; the CV is one `bio` record plus the `experience` records (decision-65). There is at most one non-draft original `bio`, plus its translations.

| Field           | Required | Format                                  | Rules                                                                     |
| --------------- | -------- | --------------------------------------- | ------------------------------------------------------------------------- |
| `name`          | yes      | one line, at most 80 characters         | the display name on cards                                                 |
| `headline`      | no       | one line, at most 120 characters        | a role line                                                               |
| `location`      | no       | one line, at most 80 characters         | city, region and country at most; a street line fails the sensitive check |
| `contact_email` | no       | email address                           | the one public contact address; the email rule allows it everywhere      |
| `contact_url`   | no       | URL                                     | a contact page                                                            |

The body is required. The example is `content/2026/20261010-about.md`:

```markdown
---
kind: bio
shortcut: about
lang: en
status: published
visibility: public
title: About
summary: A software engineer who builds developer tools and writes about how they are made.
updated: 2026-10-25
name: Jordan Sample
headline: Software engineer and open source maintainer
location: Sample City, Sampleland
contact_email: hello@example.com
refs: [20260301-laroux]
---

Who the person is, in their own words: what they work on, what they care about and where their work can be found.
```

### experience

A job, a role or a degree, with dates (decision-65 names `start`, `end`, `org`, `role` and `refs`).

| Field      | Required | Format                       | Rules                                                          |
| ---------- | -------- | ---------------------------- | -------------------------------------------------------------- |
| `type`     | yes      | `job`, `role` or `degree`    | `role` covers unpaid and community roles                       |
| `org`      | yes      | one line                     | the employer, organization or school                           |
| `role`     | yes      | one line                     | the job title, the role, or the degree and its field           |
| `start`    | yes      | month                        |                                                                |
| `end`      | no       | month                        | absent while ongoing; not earlier than `start`                 |
| `location` | no       | one line                     | city and country, or `remote`                                  |
| `org_url`  | no       | URL                          | the organization's site                                        |

The body is optional: what the work was and what came of it. The example is `content/2026/20261012-example-corp.md`; its `refs` entry is a shortcut:

```markdown
---
kind: experience
lang: en
status: published
visibility: public
title: Senior software engineer at Example Corp
summary: Led the team that built Example Corp's internal deployment tools.
updated: 2026-10-25
type: job
org: Example Corp
role: Senior software engineer
start: 2019-04
end: 2023-08
location: remote
org_url: https://example.com
refs: [about]
tags: [platform, go]
---

What the team built, which problems it solved and what the role involved.
```

### project

A library or pet project (decision-63). Applications and pet projects keep their code in their own repositories and have only this record here.

| Field     | Required | Format                                                     | Rules                                                                                   |
| --------- | -------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `repo`    | no       | URL                                                        | the sync reads GitHub facts only for this URL (decision-64)                              |
| `package` | no       | npm name, `^(?:@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$` | the sync reads npm facts only for this name (decision-64)                      |
| `domain`  | no       | lowercase host name                                        | where the project's site or landing lives                                               |
| `cli`     | no       | program name, `^[a-z0-9][a-z0-9-]*$`                       | `eser <shortcut>` forwards to it (decision-67); requires `shortcut`                      |
| `site`    | no       | `default` or `external`                                    | `default` when absent; `external` requires `domain` and hands it to the project (decision-68) |
| `stage`   | no       | `experimental`, `active`, `maintained` or `paused`         | not on an archived project                                                              |
| `started` | no       | month                                                      | when the project began; the slug date is when the record was made                       |

The body is required: why it exists, what it does, where it stands. The example is the record from doc-4, `content/2026/20260301-laroux.md`. Its `shortcut` passes the plugin rule because `cli` is `laroux`:

```markdown
---
kind: project
shortcut: laroux
lang: en
status: published
visibility: public
title: laroux
summary: A React framework on rolldown with server functions and islands.
updated: 2026-10-25
repo: https://github.com/eser/stack
package: "@eserstack/laroux"
domain: laroux.eser.dev
cli: laroux
site: external
refs: [20261010-about]
tags: [react, framework]
---

Why it exists, what it does, where it stands.
```

An archived project drops `stage` and keeps its shortcut. This fictional record shows the end of the lifecycle:

```markdown
---
kind: project
shortcut: petproject
lang: en
status: archived
visibility: public
title: petproject
summary: A small command-line game, no longer developed.
updated: 2026-10-25
repo: https://github.com/example/petproject
started: 2021
---

What it was, and why work on it stopped.
```

### approach

How the owner builds software: rules, directives and know-how. `@eserstack/directives` and the skills in `.agents/skills/` are sources for these records (ADR 0010).

| Field    | Required | Format                                     | Rules                                                                        |
| -------- | -------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `source` | no       | URL, or a path relative to the repository root | where the full rule lives; the validator checks that a path exists       |

The body is required. The example is `content/2026/20261015-explicit-checks.md`; the skill it points to names explicit checks among its rules:

```markdown
---
kind: approach
lang: en
status: published
visibility: public
title: Explicit checks over truthiness
summary: Compare against the value you mean, so an empty string or a zero is never read as missing.
updated: 2026-10-25
source: .agents/skills/javascript-practices/SKILL.md
tags: [typescript, code-review]
---

Write `value === undefined` or `items.length === 0` instead of `!value`. The check says which case it handles, and a reviewer does not have to guess.
```

### article

A blog post, written here or indexed from a blog feed. Hand-written posts are canonical here and may be published out (decision-64).

| Field          | Required | Format       | Rules                                                          |
| -------------- | -------- | ------------ | -------------------------------------------------------------- |
| `published_on` | yes      | date         | when the post first appeared                                   |
| `url`          | no       | URL          | where the post lives when it is not canonical here             |
| `outlet`       | no       | one line     | the blog or site name                                          |
| `syndicated`   | no       | list of URLs | where a post canonical here was published out                  |

A record has a body, a `url`, or both; a synced record usually has only `url`. The example is `content/2026/20261020-notes-on-small-clis.md`, canonical here:

```markdown
---
kind: article
lang: en
status: published
visibility: public
title: Notes on writing small CLIs
summary: Why a command-line tool should do one job, print machine-readable output without a TTY and fail with a clear message.
updated: 2026-10-25
published_on: 2026-10-20
syndicated: [https://blog.example.com/notes-on-small-clis]
tags: [cli, writing]
---

The text of the post.
```

### video

A YouTube video, indexed from the channel's feed (decision-64).

| Field          | Required | Format                                                  | Rules                                              |
| -------------- | -------- | ------------------------------------------------------- | -------------------------------------------------- |
| `url`          | yes      | `https://www.youtube.com/watch?v=` and an 11-character id | the `v` parameter is the only one allowed        |
| `published_on` | yes      | date                                                    | from the feed                                      |
| `channel`      | no       | slug or shortcut of a `channel` record                  | resolves like `refs`                               |

The body is optional. A summary an AI wrote makes the record a draft (decision-64). The example is `content/_synced/2026/20261101-building-a-cli-in-go.md`:

```markdown
---
kind: video
lang: en
status: published
visibility: public
title: Building a CLI in Go
summary: A walk through a small Go command-line tool, from flags to tests.
updated: 2026-11-01
url: https://www.youtube.com/watch?v=abcdefghijk
published_on: 2026-10-30
channel: youtube
---
```

### social

A post the owner picked with `eser content add <url>` (decision-64). The feed is not mirrored.

| Field          | Required | Format                                 | Rules                                        |
| -------------- | -------- | -------------------------------------- | -------------------------------------------- |
| `url`          | yes      | URL with no query parameters           | the post's canonical address                 |
| `platform`     | yes      | `x`, `bluesky` or `linkedin`           | open question 18                             |
| `published_on` | yes      | date                                   |                                              |
| `channel`      | no       | slug or shortcut of a `channel` record | resolves like `refs`                         |

The body is optional and holds the post text as published. The example is `content/2026/20261021-release-day.md`:

```markdown
---
kind: social
lang: en
status: published
visibility: public
title: Release day
summary: A short post announcing a new release of a command-line tool.
updated: 2026-10-25
url: https://bsky.app/profile/example.bsky.social/post/3kabcdefghij2
platform: bluesky
published_on: 2026-10-21
---

The post text, as it appeared.
```

### channel

An account or channel; every channel the owner has is a complete record (decision-64). The sync reads `feed` to find the YouTube videos and blog posts it indexes.

| Field      | Required | Format                                                          | Rules                                                  |
| ---------- | -------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| `platform` | yes      | `x`, `bluesky`, `youtube`, `linkedin`, `github` or `blog`       | open question 18                                       |
| `handle`   | no       | one line                                                        | the account name as the platform shows it              |
| `url`      | yes      | URL                                                             | the account page                                       |
| `feed`     | no       | URL                                                             | the RSS or Atom feed; for YouTube, `channel_id` is the one allowed query parameter |

There is one non-archived record per `platform` and `handle`. A closed account becomes `archived`. The body is optional. The example is `content/2026/20261011-youtube.md`:

```markdown
---
kind: channel
shortcut: youtube
lang: en
status: published
visibility: public
title: YouTube channel
summary: Videos about building software and the tools behind it.
updated: 2026-10-25
platform: youtube
handle: "@example"
url: https://www.youtube.com/@example
feed: https://www.youtube.com/feeds/videos.xml?channel_id=UC0000000000000000000000
---
```

### profile

A reading profile for `eser intro --for <shortcut>` (decision-65, decision-67). Adding one needs no code change.

| Field          | Required | Format                       | Rules                                                                        |
| -------------- | -------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `audience`     | yes      | one line                     | who the profile is for                                                       |
| `kinds`        | yes      | list of kind names           | the kinds the profile shows, in output order                                 |
| `include_tags` | no       | list of tags                 | when set, a record of a listed kind is shown only if it has one of these tags |

A profile requires `shortcut`. Records in its `refs` are shown first, in order, whatever their kind. The body is required: `eser intro --for` prints it before the records, addressed to that reader. The example is `content/2026/20261013-coding-agent.md`:

```markdown
---
kind: profile
shortcut: coding-agent
lang: en
status: published
visibility: public
title: For a coding agent
summary: What a coding agent reads before it writes code in one of the owner's repositories.
updated: 2026-10-25
audience: A coding agent working in one of the owner's repositories
kinds: [approach, project]
include_tags: [typescript, go, code-review]
refs: [about]
---

Read the approach records before you change code. Each project record names its repository, its package and its command.
```

## Translations

A translation is a separate file beside its original (decision-65, decision-66). The original's file name has no language suffix, whatever its language; the translation adds the suffix of its own `lang`.

| Original                                | Translation                               |
| --------------------------------------- | ----------------------------------------- |
| `content/2026/20261010-about.md` (`lang: en`) | `content/2026/20261010-about.tr.md` (`lang: tr`) |
| `content/2026/20261105-sample.md` (`lang: tr`) | `content/2026/20261105-sample.en.md` (`lang: en`) |

The validator checks these rules on a translation:

- `translation_of` is present and equals the slug in the file name, and the original exists in the same folder.
- `lang` equals the file name's suffix and differs from the original's `lang`.
- There is one translation per language per original, and no translation of a translation.
- `kind` equals the original's. The translation carries no `shortcut`.
- `status` and `visibility` are its own, but never wider than the original's: a published translation of a draft, or a public translation of an unlisted original, is rejected.
- Besides the shared required fields, a translation may carry only the fields that read differently in another language: `title`, `summary`, the body, `headline` and `location` on a bio, `role` and `location` on an experience, and `audience` on a profile. Every other field (`refs`, `tags`, dates, URLs, names) comes from the original, and the validator rejects it on the translation.

`eser intro --lang tr` returns the translation when it exists and the original when it does not (decision-66). The example is `content/2026/20261010-about.tr.md`; in the real file, the values below are Turkish text:

```markdown
---
kind: bio
translation_of: 20261010-about
lang: tr
status: published
visibility: public
title: The title, in Turkish
summary: The summary, in Turkish.
updated: 2026-10-25
headline: The headline, in Turkish
---

The body, in Turkish.
```

## Sensitive Data the Validator Rejects

The repository is public and git history keeps what a later commit removes, so the validator checks every file under `content/` before it is committed: drafts, unlisted records and `content/_synced/` included, the frontmatter values and the body, code blocks too (decision-66). The sync adapters face the same check, so a video description with a phone number in it fails the sync pull request until the adapter drops that text.

A finding names the file, the line and the rule id. It never prints the matched text, so a leaked secret does not move into CI logs (security-practices: secrets and personal data never reach logs). There is no inline marker that silences a rule (open question 16). Each rule id gets one failing fixture in TASK-345.

### email

```text
[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}
mailto:\S+
[A-Za-z0-9._%+-]+\s*[\[({]\s*at\s*[\])}]\s*[A-Za-z0-9-]+(?:\s*[\[({]\s*dot\s*[\])}]\s*[A-Za-z0-9-]+)+
```

The third pattern catches written-out forms such as `name [at] host [dot] com`.

Allowed:

- the `contact_email` of the bio record, compared without case;
- any address at `example.com`, `example.org` or `example.net`, or under the `.example`, `.test` and `.invalid` top-level domains (RFC 2606);
- `git@github.com`, `git@gitlab.com` and `git@codeberg.org` in SSH remote addresses.

Package specifiers such as `@eserstack/laroux` and `eser@latest` do not match, because the pattern needs a local part and a dotted domain with a letter top-level domain.

### phone

```text
tel:\S+
(?<![\w.])(?:\+|00)[1-9][0-9 ().-]{6,20}[0-9]     flagged when it holds 8 to 15 digits
(?<![\w.])0[1-9][0-9 ().-]{7,14}[0-9]              flagged when it holds 10 or 11 digits
(?<![\w.])\(?[2-9][0-9]{2}\)?[ .-][0-9]{3}[ .-][0-9]{4}(?!\w)
```

The second line covers international numbers, the third national numbers with a trunk prefix (a Turkish mobile number written `0` and ten digits, for example), the fourth the North American form.

Allowed: a candidate that holds a date written `YYYY-MM-DD`, `DD.MM.YYYY` or `DD/MM/YYYY`, a year range such as `2019-2023`, a version such as `4.5.2`, and digits inside a URL or a slug. No number is allowed, the owner's included; a contact goes through `contact_email` or `contact_url`.

### street-address

The validator rejects a line that holds a street word and a house number:

```text
\b[0-9]{1,5}[A-Za-z]?\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Square|Sq|Terrace|Way)\b
\b(?:Apt|Apartment|Suite|Ste|Flat|Unit)\.?\s*#?\s*[0-9]+[A-Za-z]?\b
\bP\.?\s?O\.?\s+Box\s+[0-9]+
\b(?:Caddesi|Cad\.|Cd\.|Sokak|Sokağı|Sok\.|Sk\.|Bulvarı|Blv\.)\s*(?:No|Numara)?\s*[:.]?\s*[0-9]+
a Turkish street word above and, on the same line, No, No: or Numara followed by a number
\b(?:Daire|Kat)\s*[:.]?\s*[0-9]+\b
```

Allowed: city, region, neighborhood and country names, an organization's name without its street, and the word "street" in prose ("street photography"), since every pattern needs a house number. Postal codes alone are not flagged, because five-digit numbers are everywhere.

### secret-token

```text
gh[pousr]_[A-Za-z0-9]{36,}                 GitHub tokens
github_pat_[A-Za-z0-9_]{22,}               GitHub fine-grained tokens
npm_[A-Za-z0-9]{36}                        npm tokens
\b(?:AKIA|ASIA)[A-Z0-9]{16}\b              AWS access key ids
xox[abprs]-[A-Za-z0-9-]{10,}               Slack tokens
sk_(?:live|test)_[A-Za-z0-9]{16,}          Stripe secret keys (and rk_live_ restricted keys)
AIza[0-9A-Za-z_-]{35}                      Google API keys
sk-ant-[A-Za-z0-9_-]{20,}                  Anthropic API keys
sk-[A-Za-z0-9_-]{20,}                      OpenAI-style API keys
\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b          Telegram bot tokens
eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}   JSON Web Tokens
-----BEGIN [A-Z ]*PRIVATE KEY-----         private keys
(?i)\b(?:api[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret|access[_-]?key)\b\s*[:=]\s*["']?[A-Za-z0-9/+_.=-]{12,}
```

Allowed: in the last pattern, a value that is a placeholder in the documentation style, `your_` followed by `snake_case` words (`your_access_token`). There is no entropy check, because YouTube ids, post ids and hashes would trip it.

### private-network

```text
\b10(?:\.[0-9]{1,3}){3}\b
\b172\.(?:1[6-9]|2[0-9]|3[01])(?:\.[0-9]{1,3}){2}\b
\b192\.168(?:\.[0-9]{1,3}){2}\b
\b100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])(?:\.[0-9]{1,3}){2}\b      carrier-grade NAT, also used by mesh VPNs
\b169\.254(?:\.[0-9]{1,3}){2}\b                                          link-local
\bf[cd][0-9a-f]{2}:[0-9a-f:]+                                            IPv6 unique local, without case
\bfe80:[0-9a-f:]*                                                        IPv6 link-local, without case
\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:local|lan|internal|intranet|corp|home\.arpa)(?![.\w-])
```

The last pattern catches internal host names; the lookahead keeps `settings.local.json` from matching. Allowed: loopback (`127.0.0.0/8`, `::1`, `localhost`), `0.0.0.0`, and the documentation ranges `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` and `2001:db8::/32`. Public addresses are allowed for now (open question 15).

### url-secret

```text
\b[a-z][a-z0-9+.-]*://[^\s/:@]+:[^\s/@]+@                                credentials in a URL
(?i)[?&#;](?:session|session_id|sessionid|sid|phpsessid|jsessionid|token|access_token|id_token|refresh_token|auth|code|key|api_key|apikey|secret|password|pwd|signature|sig|x-amz-signature|x-amz-credential|x-amz-security-token|x-goog-signature)=
https://hooks\.slack\.com/services/\S+
https://discord(?:app)?\.com/api/webhooks/\S+
(?im)^\s*(?:set-)?cookie:\s*\S+
(?i)authorization:\s*(?:bearer|basic|token)\s+\S+
```

The second pattern covers session ids, OAuth codes and the signatures of pre-signed storage URLs. Allowed: query parameters outside that list, such as YouTube's `v` and `t`. URL fields are stricter still, as [Shared Fields](#shared-fields) says: a field accepts only the parameters it names.

### national-id, bank-account and payment-card

```text
\b[1-9][0-9]{10}\b             Turkish national id, flagged when it passes the checksum
\b[A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b   IBAN, flagged when mod 97 equals 1
\b(?:[0-9][ -]?){12,18}[0-9]\b payment card, flagged when it passes the Luhn check
```

The national id checksum: with digits d1 to d11, d10 equals ((d1 + d3 + d5 + d7 + d9) * 7 - (d2 + d4 + d6 + d8)) mod 10, and d11 equals the sum of d1 to d10 mod 10. Allowed: digits inside a URL, since X post ids have 18 to 19 digits and some pass the Luhn check by chance.

### home-path

```text
/Users/[^/\s]+/
/home/[^/\s]+/
[A-Za-z]:\\Users\\[^\\\s]+\\
```

An absolute home path gives away a local account name. Allowed: `~/...`, `$HOME/...` and paths relative to the repository root.

### geo-coordinates

```text
-?[0-9]{1,2}\.[0-9]{4,}\s*,\s*-?[0-9]{1,3}\.[0-9]{4,}
```

Four decimals place a point within about 11 meters, close enough to find a house. Allowed: coordinates with three decimals or fewer, which describe a city or a district.

## How the Tasks Use This Spec

The dependent tasks read these sections:

| Task     | Sections it builds on                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| TASK-344 | Shared Fields, Kinds, Translations: the typed values, unknown-key rejection, value normalization   |
| TASK-345 | Directory Layout and File Names, Slug Grammar, Shortcut Grammar and Resolution, Reserved Names, Sensitive Data (one fixture per rule id), the `updated` writer |
| TASK-346 | Shortcut Grammar and Resolution: first-character dispatch, the uniqueness scope                     |
| TASK-347 | Reserved Names and the plugin rule, the profile shortcut for `--for`, `eser intro <kind>`           |
| TASK-348 | Directory Layout and File Names, `lang`, Translations                                              |
| TASK-349 | Status Values and the Project Lifecycle: which records the snapshot carries                        |
| TASK-350 | Slug Grammar (name derivation), video and social fields, URL query rules, drafts                    |
| TASK-351 | `content/_synced/`, `channel.feed`, `project.repo` and `project.package`, published or draft        |
| TASK-352 | `project.domain`, `site` and `stage`, archived records on the landing                              |

## Open Questions

The decisions do not settle these. Each has a recommendation; the body follows it until the owner answers.

1. Project lifecycle in one field or two: `status` (`draft`, `published`, `archived`) plus an optional `stage` (`experimental`, `active`, `maintained`, `paused`), or the stage values inside `status`. Recommended: two fields, because `status` then means the same thing for all nine kinds and doc-4's example keeps `status: published`.
2. `archived` for every kind or for projects only, and whether every archived record skips the staleness check. Recommended: every kind and every archived record; a closed channel or a retired approach should not show as stale.
3. Where archived public records appear. Recommended: in the snapshot, on the site and on the landing with an archived badge, resolvable by `eser <shortcut>`, and listed after current records in `eser intro`.
4. Shortcut uniqueness among `published` only (the wording of decision-65) or among every non-draft record. Recommended: every non-draft record, so an archived project keeps its name.
5. Shortcuts on `unlisted` records. Recommended: reject them, since the snapshot leaves unlisted records out (TASK-349) and the shortcut could not resolve.
6. Kind names as reserved shortcuts. Recommended: reserve them, so `eser intro bio` always means the kind.
7. What `eser <name>` does for a shortcut that is not a project (`about`, `coding-agent`, `youtube`); decision-67 covers projects only. Recommended: print the record's title, summary and the `eser intro` command that shows it.
8. Manifest script names (`ok`, `fix`, `test`, `release` and the other scripts in `.eser/manifest.yml`) and the place of shortcuts in the resolution order of `cmd/eser/app.go` (built-in, script, plugin). Recommended: built-in, then script, then shortcut, then `eser-<name>` plugin, and reserve this repository's script names too.
9. Slug date of synced and imported records. decision-65 makes it the creation date, which files every older YouTube video under the year of its first sync, with the platform date in `published_on`. Recommended: keep decision-65 as written; this asks only for a confirmation.
10. Where the GitHub and npm facts go (stars, last release, last commit, version; decision-64). No kind holds them, and the sync must not edit the hand-written project record. Options: a new kind such as `facts` with `facts_of: <slug>` under `content/_synced/`, a second `project` record under `content/_synced/`, or keeping them out of `content/` in the snapshot builder. Recommended: a new kind, since doc-4 says new kinds are a schema change; it needs the owner's approval because doc-4 lists nine.
11. How the wildcard Worker finds a project's record: by `domain`, or by `<shortcut>.eser.dev` when `domain` is absent. Recommended: by `domain` only, so a landing exists only where the owner asked for one.
12. Which English record `eser intro` shows when a record exists only in Turkish. Recommended: the Turkish original with its `lang`, so nothing disappears from the default listing.
13. Whether `eser content stale` lists a translation whose `updated` is earlier than its original's. Recommended: yes, as an outdated translation; the gate still never fails.
14. The size limits proposed here: `title` 120, `summary` 280, slug name 60, shortcut 2 to 32, `tags` 10 entries of 32 characters. Recommended: keep them; the summary limit fits one `llms.txt` line.
15. Whether the sensitive check also rejects public IP addresses and full birth dates. Recommended: reject every literal IP address except loopback and the documentation ranges; add no birth-date field and no birth-date pattern.
16. A way to silence a false positive. Recommended: none in the record; reword the text, or narrow the pattern in the validator together with a fixture.
17. Images and other assets for records and landings. Recommended: out of scope until TASK-352 needs one; `content/` holds Markdown only.
18. The platform sets: `x`, `bluesky` and `linkedin` for `social`, plus `youtube`, `github` and `blog` for `channel`, taken from the sources in decision-64. Another platform needs a schema change. Recommended: keep these sets.
19. The `lang` value set: any ISO 639-1 code, or only `en` and `tr`. Recommended: any two-letter code; only `en` and `tr` appear now.

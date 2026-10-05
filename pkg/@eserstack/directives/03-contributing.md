# 📓 [@eserstack/directives/contributing](./03-contributing.md)

How to contribute to an eserstack project. A project's own `CONTRIBUTING.md`
links here and adds only what is specific to it: its development setup, its
commands and its extension points.

Thank you for taking the time to contribute. These are guidelines rather than
strict rules; when one does not fit, propose a change to it in a pull request.

## Code of Conduct

Everyone taking part follows the [Code of Conduct](01-social.md). To report a
possible violation, email [eser@acikyazilim.com](mailto:eser@acikyazilim.com).

## Ways to Contribute

- Reporting bugs and developer experience problems
- Suggesting enhancements and new features
- Fixing bugs
- Improving performance
- Improving documentation
- Linking to your project built with eserstack

## Finding Something to Work On

Issues labeled `good first issue` are the place to start. Each one has a clear
acceptance criterion and a size estimate.

## Creating an Issue

- Search the existing issues first, so the same problem is not filed twice.
- Use the project's issue templates. When a template asks for diagnostics
  output, paste it in full.
- Questions and discussions belong in the issue tracker too.
- Before a significant change, open an issue and agree on the design there, so
  the work does not go into an approach that will not be accepted.

## Before Writing Code

- Read the project's architecture decision records (usually under `docs/adr/`)
  before changing an area they cover.
- Follow the [technical directives](02-technical.md) and the conventions the
  project documents in its `CONTRIBUTING.md` and `AGENTS.md`.
- Do not edit generated files, such as API references or generated manifests.
  Change the source they are built from; the next build overwrites the edit.

## Code Standards

- Formatting, linting and type checking pass: `deno fmt`, `deno lint` and
  `deno check` for TypeScript, `golangci-lint` for Go.
- Public APIs do not use `any`; prefer discriminated unions.
- A lint suppression (`//nolint:`, `// deno-lint-ignore`) carries a comment that
  says why.
- Every fix and new feature comes with tests.

## Commits

- Follow Conventional Commits: `type(scope): outcome`, for example
  `fix(cache): expire entries at the configured TTL`.
- Keep the message to one line, two at most. Put the reasoning in the issue or
  the pull request description.
- Keep a refactor in its own commit, apart from the behavior change.
- Run the project's full check before every commit. The project's
  `CONTRIBUTING.md` names the command, and a pre-commit hook may enforce it.

## Submitting a Pull Request

1. Fork the repository and make the change on a new branch.
2. Add tests, and update the documentation the change affects.
3. Run the project's full check until it passes.
4. Push the branch to your fork and open a pull request that links the issue
   (`Fixes #123`). Fill in the pull request template.

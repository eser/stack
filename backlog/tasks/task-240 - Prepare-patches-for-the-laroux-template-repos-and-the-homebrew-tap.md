---
id: TASK-240
title: Prepare patches for the laroux template repos and the homebrew-tap
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-27 15:52'
labels:
  - laroux
  - distribution
  - homebrew
  - external
milestone: m-2
dependencies:
  - TASK-237
priority: medium
ordinal: 240000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Per decision external-repos, these repos also need the migration, and agents never push to them:
- `laroux init` clones gh:eser/laroux-template-{minimal,blog,dashboard,docs} (laroux-server/commands/init.ts:70).
- The eser/homebrew-tap repo keeps eser, noskills and laroux formulas.
In scratch clones outside the repo:
- Move each template to package.json scripts on `laroux dev|build|serve`, npm dependencies and no deno.json, and check that each scaffolds and builds with the packed laroux from M2-T6.
- Prepare a homebrew-tap patch that deprecates the laroux formula with a `deprecate!` pointing to npm, and that pauses or forwards the eser and noskills formulas per decision binaries.
Hand the patches to the owner.

Decisions this task waits on: decision-23 (How the laroux template repos and the homebrew-tap migrate).

The template patches here target today's pipeline. A second round follows the R1 recipe shape after TASK-316.

Plan key: M2-T10. Effort: small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The template repos are settled: they do not exist, and `laroux init` moves to the in-repo kit recipes (owner decision 2026-10-27, TASK-370), so no template patch is needed
- [x] #2 The homebrew-tap patch passes `brew audit` in dry-run mode
- [x] #3 The patches and apply instructions are in the task; nothing was pushed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Worked on 2026-10-27, macOS arm64, Node 26.12.1, Homebrew 7.0.10. Every clone, app and tap check ran in a fresh `mktemp -d` scratch directory under the OS temp dir, outside every repository. Nothing was committed, pushed or created on GitHub.

### Template repos: blocked, the repos do not exist

- `git clone https://github.com/eser/laroux-template-{minimal,blog,dashboard,docs}.git` failed for all four (git asked for credentials). `gh api repos/eser/laroux-template-<name>` answers HTTP 404 for each, with the owner's authenticated gh; `gh repo list eser` (342 repos) and `gh search repos laroux-template` list none of them. There is nothing to patch.
- So `laroux init` is broken today, not only Deno-era. With the packed laroux (built and packed in the worktree as the preflight does: `pnpm install --frozen-lockfile`, `make ajan-lib`, `pnpm -r build`, `pnpm -r --filter "./pkg/@eserstack/*" pack --pack-destination etc/temp/npm-packs`, then installed into a scratch app by `node etc/scripts/preflight-laroux-app.ts --app-dir <scratch>`, which printed "laroux app preflight: OK"), `laroux init demo -t minimal --no-git --no-install` fails with "download https://codeload.github.com/eser/laroux-template-minimal/tar.gz/main: HTTP 404"; blog prints the same error, and docs exits 1 the same way.
- `laroux init` cannot take a local path: commands/init.ts accepts only the four names of `TEMPLATES` ("Invalid template" otherwise) and always builds the specifier `gh:eser/laroux-template-<name>`; kit's clone handler fetches from raw.githubusercontent.com and codeload.github.com with no override. AC #1 needs either the repos or a local-path option in init.
- Two smaller init defects seen on the way, for a follow-up task in laroux-server: a failed init leaves an empty project directory behind, and `laroux init --help` is not a help flag; it scaffolds into ./my-laroux-app.
- Owner decision needed (decision-23 assumed the repos exist): (a) create the four repos, seeding minimal from `.eser/recipes/laroux-app`, which already has npm dependencies, `laroux dev|build|serve` scripts and no deno.json, and passes the preflight; blog, dashboard and docs have no source anywhere to migrate; or (b) decision-23's second option: point `laroux init` at the in-repo recipes through kit and drop the template names without a recipe. Recommended: (b), since the in-repo recipe is the one template that exists and CI already checks it.

### homebrew-tap: patch ready

The tap is not what decision-23 describes. Its main (73d7404) holds `Formula/eser.rb` at 4.1.56 and a GoReleaser `noskills-server.rb` at the repo root (4.1.60). No `laroux` or `noskills` formula was ever in its history. Homebrew reads only `Formula/` once that directory exists, so the root file is invisible: a local tap of the unpatched clone printed "Tapped 1 formula", and `brew info <tap>/noskills-server` answered "No available formula". `brew audit --strict` of the unpatched eser.rb fails: "`version 4.1.56` is redundant with version scanned from URL".

What the patch does:

- Adds `Formula/laroux.rb`, deprecated with `deprecate!` pointing to npm. It installs the last real laroux binary, v4.5.1 (v4.5.2 has no release assets), with the sha256 values of that release's SHA256SUMS.txt; the darwin arm64 archive was downloaded, its sha256 matched, and its binary answers `laroux version --bare` with 4.5.1 (it prints help for `--version`, so the test uses `version --bare`). `brew info` shows: "Deprecated because it is now on npm: run `npm install --save-dev laroux` in your app! It will be disabled on 2027-10-27."
- Drops the redundant `version` line of `Formula/eser.rb`, so the tap passes `brew audit --strict`.
- eser and noskills: forwarded, per decision-8 (binaries), which makes both Go binaries and lets each channel decide per release from the archives present. `eser dev homebrew` (PlanHomebrew in pkg/ajan/codebasefx/release_distribution.go) rewrites `Formula/eser.rb` and creates `Formula/noskills.rb` from the Go archives of a release, and leaves a formula as it is when the release has no archive of it, which is the pause. So the tap needs no edit for them; eser stays at 4.1.56 until the first release that ships Go eser archives.
- Removes the root `noskills-server.rb`: Homebrew cannot see it, GoReleaser no longer runs in eser/stack, `eser dev homebrew` writes `Formula/noskills-server.rb` instead, and the old file installs a `noskills` binary as well, which would clash with `Formula/noskills.rb` at link time.
- Adds a laroux section with the npm command to the README.

Verified, all on the host, nothing installed and nothing pushed: `brew tap-new <scratch-user>/patched --no-git`, the patched `Formula/eser.rb` and `Formula/laroux.rb` copied into it, then `brew audit --strict --formula <scratch-user>/patched/laroux <scratch-user>/patched/eser` (exit 0, no problems; the first run had found three laroux problems, now fixed: the desc started lowercase and with the formula name, and `deprecate!` came after `on_macos`), `brew style` on both (no offenses), then `brew untap` of both local taps; `brew tap` lists neither. `brew audit` fetched its RuboCop and Sorbet gems into Homebrew's vendor bundle; that is Homebrew's own cache. `--online`, `brew install` and `brew test` were not run. `git apply --check` and `git apply` of the patch below, plus `git rm noskills-server.rb`, on a fresh clone of the tap's main reproduce the audited tree.

Apply, in a clone of eser/homebrew-tap at 73d7404, with the patch below saved as `homebrew-tap.patch`:

```bash
git apply homebrew-tap.patch
git rm noskills-server.rb
git add Formula/laroux.rb Formula/eser.rb README.md
brew tap-new local/tap-check --no-git
cp Formula/eser.rb Formula/laroux.rb "$(brew --repo local/tap-check)/Formula/"
brew audit --strict --formula local/tap-check/laroux local/tap-check/eser
brew untap local/tap-check
git commit -m "chore: deprecate the laroux formula in favor of npm"
```

`brew audit` takes formula names only (a path answers "Calling `brew audit [path ...]` is disabled"), hence the throwaway local tap, the same check as above.

````diff
diff --git a/Formula/eser.rb b/Formula/eser.rb
index 6b7b59a..099da4c 100644
--- a/Formula/eser.rb
+++ b/Formula/eser.rb
@@ -1,7 +1,6 @@
 class Eser < Formula
   desc "Terminal client for Eser's work"
   homepage "https://github.com/eser/stack"
-  version "4.1.56"
   license "Apache-2.0"

   on_macos do
diff --git a/Formula/laroux.rb b/Formula/laroux.rb
new file mode 100644
index 0000000..bdd324d
--- /dev/null
+++ b/Formula/laroux.rb
@@ -0,0 +1,38 @@
+class Laroux < Formula
+  desc "Command-line tool for laroux.js apps"
+  homepage "https://github.com/eser/stack"
+  license "Apache-2.0"
+
+  # From 5.0.0 laroux is published to npm only.
+  deprecate! date: "2026-10-27", because: "is now on npm: run `npm install --save-dev laroux` in your app"
+
+  on_macos do
+    on_arm do
+      url "https://github.com/eser/stack/releases/download/v4.5.1/laroux-v4.5.1-aarch64-apple-darwin.tar.gz"
+      sha256 "802a01a59806037467d45cc8d821ca49019f41f414eecfe2d8bceb18262ef7d1"
+    end
+    on_intel do
+      url "https://github.com/eser/stack/releases/download/v4.5.1/laroux-v4.5.1-x86_64-apple-darwin.tar.gz"
+      sha256 "b486a5bf2540be207422dcb3d81dfe2ac6a6a77cfd86ea34b6b5aaaf85165a9d"
+    end
+  end
+
+  on_linux do
+    on_arm do
+      url "https://github.com/eser/stack/releases/download/v4.5.1/laroux-v4.5.1-aarch64-unknown-linux-gnu.tar.gz"
+      sha256 "fd95c9a748c7f041aca8aad9fa548078bb5b62533069964f56ba780d1b32178a"
+    end
+    on_intel do
+      url "https://github.com/eser/stack/releases/download/v4.5.1/laroux-v4.5.1-x86_64-unknown-linux-gnu.tar.gz"
+      sha256 "f5b51cd0557a343931e5c8d7918dafaf9bc413ccbeb754e5787dbab7bbf7808b"
+    end
+  end
+
+  def install
+    bin.install "laroux"
+  end
+
+  test do
+    assert_match version.to_s, shell_output("#{bin}/laroux version --bare")
+  end
+end
diff --git a/README.md b/README.md
index 07ce6b1..d5ec02e 100644
--- a/README.md
+++ b/README.md
@@ -16,3 +16,11 @@ brew update
 brew upgrade eser
 ```

+## laroux
+
+From 5.0.0 laroux is published to npm only, and the `laroux` formula is
+deprecated. Add laroux to your app as a dev dependency instead:
+
+```bash
+npm install --save-dev laroux
+```
````

Owner decisions taken here, conservatively:

- laroux: the tap never had a laroux formula, so nobody installed laroux through it. The patch adds one that is deprecated from the start, so `brew install` of it points to npm. The alternative is to add no formula and keep only the README note.
- eser and noskills: forwarded to the Go binaries by the release pipeline, paused while a release has no archive of them, as decision-8 says; no tap edit.

### Follow-ups in eser/stack (not changed here; this task edits only the tap)

- The deprecation does not last. `ReleaseBinaries` builds the laroux forwarding stub under the `laroux` archive name, and `HomebrewFormulas` lists laroux, so the first release that ships the stub makes `update-homebrew` overwrite `Formula/laroux.rb` with a stub formula that has no `deprecate!`. RenderHomebrewFormula needs a `deprecate!` for laroux, or laroux leaves `HomebrewFormulas`; that needs its own task.
- RenderHomebrewFormula emits `version "<v>"`, which `brew audit --strict` rejects (seen on the tap's eser.rb, which has the same line), and the laroux desc "laroux.js framework CLI" fails the desc rules (seen in the audit); the noskills-server desc starts with the formula name too (not run, same rule).
- The tap's eser.rb is at 4.1.56 although v4.5.1 has eser archives, so `update-homebrew` (continue-on-error) has not updated the tap since 4.1.56.

Owner decisions 2026-10-27: option (b) for the templates. `laroux init` scaffolds from the in-repo kit recipes and drops the template names without a recipe; that work is TASK-370, including the two init defects above. AC #1 is reworded to that outcome, and AC #3 holds with the tap patch as the only external patch. The two renderer follow-ups (the laroux `deprecate!` and audit-clean formulas) are TASK-371.
<!-- SECTION:NOTES:END -->

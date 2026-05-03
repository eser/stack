#!/usr/bin/env -S deno run --allow-read
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
//
// hybrid-sniffer.ts — Detect potential hybrid FFI-routing branches in @eserstack packages.
//
// Usage:
//   deno run --allow-read scripts/hybrid-sniffer.ts pkg/@eserstack/<package>
//   deno run --allow-read scripts/hybrid-sniffer.ts pkg/@eserstack/cs pkg/@eserstack/cache
//
// Output: a classification table for every FFI-calling TS file in each package.
//
// Classification legend:
//   PURE_FFI                — FFI is tried first; only null-handle guard or catch(→fallback)
//   FFI_WITH_TS_FALLBACK    — FFI is tried; on failure/null a full TS implementation runs the same op
//   FFI_WITH_EMPTY_FALLBACK — FFI is tried; on failure the function returns null/undefined/throws
//                             (no real TS fallback — the feature just becomes unavailable)
//   HYBRID_ROUTING          — FFI path is conditional on a *parameter value* (format, type, etc.),
//                             and the else branch runs a non-FFI implementation for the same op
//   POST_FFI_FORMAT_DISPATCH — format/type dispatch exists but is *inside* the TS fallback body,
//                             not used to route between FFI and TS
//   NO_FFI                  — file imports ffi-client but makes no actual EserAjan* calls

const ESER_AJAN_CALL_RE = /EserAjan[A-Za-z]+/g;
const FORMAT_ROUTING_RE =
  /if\s*\([^)]*(?:format|type|kind|mode)\s*===?\s*["'][^"']+["'][^)]*\)\s*\{[^}]*(?:EserAjan|getLib|lib\.symbols)/;
const INSIDE_FALLBACK_RE =
  /\/\/\s*(?:TS fallback|TypeScript fallback|fallback)[\s\S]{0,2000}if\s*\([^)]*(?:format|type|kind)\s*===?\s*/;
// Null-guard patterns: `if (lib === null)`, `if (!lib)`, `if (lib != null)`, `if (handle !== null)`
const LIB_NULL_GUARD_RE =
  /if\s*\(\s*(?:lib\w*|handle\w*)\s*(?:===|==)\s*null\s*\)|if\s*\(\s*!\s*(?:lib\w*|handle\w*)\s*\)|if\s*\(\s*(?:lib\w*|handle\w*)\s*!==?\s*null\s*\)/;
// Empty fallback: return with noop lambdas `() => {}` or `return null/undefined`.
// NOTE: `throw new Error` is intentionally excluded — a null-guard that throws is Option B
// (PURE_FFI: requires native lib, throws if unavailable). It is NOT an empty fallback.
const NOOP_FALLBACK_RE =
  /\(\)\s*=>\s*\{\s*\}|return\s+(?:null|undefined)\s*;|Promise\.reject\s*\(/;
// Optional chaining on a lib reference: `lib?.symbols.X()` or `getLib()?.symbols.X()`
// This is a silent-skip pattern — semantically identical to `if (lib !== null) { ... }`
// with no fallback, i.e. FFI_WITH_EMPTY_FALLBACK.
const LIB_OPTIONAL_CHAIN_RE =
  /(?:getLib\s*\(\s*\)|lib\w*)\s*\?\./;
// Throw-on-null: `if (lib === null) { throw new Error(...)` — Option B pattern.
// The null guard exists only to enforce availability; the function is PURE_FFI.
const THROW_ON_NULL_RE = /throw\s+new\s+Error/;

interface FileReport {
  file: string;
  ffiSymbols: string[];
  classification:
    | "PURE_FFI"
    | "FFI_WITH_TS_FALLBACK"
    | "FFI_WITH_EMPTY_FALLBACK"
    | "HYBRID_ROUTING"
    | "POST_FFI_FORMAT_DISPATCH"
    | "NO_FFI";
  evidence: string;
}

async function* walkDir(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      yield* walkDir(path);
    } else if (entry.isFile && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      yield path;
    }
  }
}

function classifyFile(source: string, filePath: string): FileReport {
  const ffiCalls = [...source.matchAll(ESER_AJAN_CALL_RE)].map((m) => m[0]);
  const uniqueSymbols = [...new Set(ffiCalls)];

  if (uniqueSymbols.length === 0) {
    return {
      file: filePath,
      ffiSymbols: [],
      classification: "NO_FFI",
      evidence: "No EserAjan* calls found",
    };
  }

  // Check for HYBRID_ROUTING: format/type condition GUARDS the FFI call
  // (i.e., FFI only runs when format equals a specific value)
  const hybridMatch = FORMAT_ROUTING_RE.exec(source);
  if (hybridMatch) {
    const snippet = source.slice(
      Math.max(0, hybridMatch.index - 30),
      Math.min(source.length, hybridMatch.index + 120),
    ).replace(/\n/g, " ").trim();
    return {
      file: filePath,
      ffiSymbols: uniqueSymbols,
      classification: "HYBRID_ROUTING",
      evidence: `Format/type condition guards FFI call: "${snippet}"`,
    };
  }

  // Check for POST_FFI_FORMAT_DISPATCH: format/type dispatch exists but only
  // inside a TS fallback section (after the FFI path has already been tried)
  const hasFallbackFormatDispatch = INSIDE_FALLBACK_RE.test(source);
  if (hasFallbackFormatDispatch) {
    // Confirm there's no FFI-guard pattern (the format check isn't routing FFI vs TS)
    const fallbackSection = source.indexOf("// TS fallback");
    if (fallbackSection > 0) {
      const beforeFallback = source.slice(0, fallbackSection);
      const formatBeforeFallback =
        /if\s*\([^)]*(?:format|type)\s*===?\s*["'][^"']+["']/.test(beforeFallback);
      if (!formatBeforeFallback) {
        return {
          file: filePath,
          ffiSymbols: uniqueSymbols,
          classification: "POST_FFI_FORMAT_DISPATCH",
          evidence: "format/type dispatch found inside TS fallback body, not in FFI routing",
        };
      }
    }
  }

  // Check for FFI_WITH_EMPTY_FALLBACK / FFI_WITH_TS_FALLBACK:
  // a lib null-guard wraps the FFI call, with either a noop/null fallback or a real TS fallback.
  const nullGuardMatch = LIB_NULL_GUARD_RE.exec(source);
  if (nullGuardMatch) {
    // Option B (throw on null): guard exists only to enforce availability → PURE_FFI.
    const throwWindow = source.slice(
      nullGuardMatch.index,
      Math.min(source.length, nullGuardMatch.index + 250),
    );
    if (THROW_ON_NULL_RE.test(throwWindow)) {
      return {
        file: filePath,
        ffiSymbols: uniqueSymbols,
        classification: "PURE_FFI",
        evidence: `lib null-guard + throw (Option B — requires native lib): "${throwWindow.slice(0, 80).replace(/\n/g, " ").trim()}"`,
      };
    }

    // Extract the fallback block after the null guard (up to 600 chars of context)
    const afterGuard = source.slice(
      nullGuardMatch.index,
      Math.min(source.length, nullGuardMatch.index + 600),
    );

    const hasNoopFallback = NOOP_FALLBACK_RE.test(afterGuard);
    if (hasNoopFallback) {
      return {
        file: filePath,
        ffiSymbols: uniqueSymbols,
        classification: "FFI_WITH_EMPTY_FALLBACK",
        evidence: `lib null-guard with noop/null fallback near: "${afterGuard.slice(0, 80).replace(/\n/g, " ").trim()}"`,
      };
    }

    return {
      file: filePath,
      ffiSymbols: uniqueSymbols,
      classification: "FFI_WITH_TS_FALLBACK",
      evidence: `lib null-guard with substantial TS fallback near: "${afterGuard.slice(0, 80).replace(/\n/g, " ").trim()}"`,
    };
  }

  // Check for optional chaining on a lib reference: `lib?.symbols.X()` or `getLib()?.X()`
  // Semantically identical to `if (lib !== null) { ... }` with no fallback.
  const optChainMatch = LIB_OPTIONAL_CHAIN_RE.exec(source);
  if (optChainMatch) {
    const snippet = source
      .slice(optChainMatch.index, Math.min(source.length, optChainMatch.index + 80))
      .replace(/\n/g, " ")
      .trim();
    return {
      file: filePath,
      ffiSymbols: uniqueSymbols,
      classification: "FFI_WITH_EMPTY_FALLBACK",
      evidence: `lib optional-chain silent-skip near: "${snippet}"`,
    };
  }

  return {
    file: filePath,
    ffiSymbols: uniqueSymbols,
    classification: "PURE_FFI",
    evidence: `FFI calls: ${uniqueSymbols.join(", ")}`,
  };
}

async function analyzePackage(pkgPath: string): Promise<FileReport[]> {
  const reports: FileReport[] = [];

  try {
    for await (const file of walkDir(pkgPath)) {
      const source = await Deno.readTextFile(file);
      // Only analyze files that use FFI infrastructure
      if (!source.includes("@eserstack/ajan") && !source.includes("EserAjan")) {
        continue;
      }
      reports.push(classifyFile(source, file.replace(pkgPath + "/", "")));
    }
  } catch (e) {
    console.error(`Error analyzing ${pkgPath}: ${e}`);
  }

  return reports;
}

function renderTable(reports: FileReport[]): void {
  if (reports.length === 0) {
    console.log("  (no FFI-using files found)");
    return;
  }

  const colWidths = { file: 55, cls: 28, evidence: 60 };
  const header = `| ${"file".padEnd(colWidths.file)} | ${"classification".padEnd(colWidths.cls)} | ${"evidence".padEnd(colWidths.evidence)} |`;
  const sep = `|${"-".repeat(colWidths.file + 2)}|${"-".repeat(colWidths.cls + 2)}|${"-".repeat(colWidths.evidence + 2)}|`;
  console.log(header);
  console.log(sep);

  for (const r of reports) {
    const evidence = r.evidence.length > colWidths.evidence
      ? r.evidence.slice(0, colWidths.evidence - 3) + "..."
      : r.evidence;
    const file = r.file.length > colWidths.file
      ? "..." + r.file.slice(-(colWidths.file - 3))
      : r.file;
    console.log(
      `| ${file.padEnd(colWidths.file)} | ${r.classification.padEnd(colWidths.cls)} | ${evidence.padEnd(colWidths.evidence)} |`,
    );
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

const args = Deno.args;
if (args.length === 0) {
  console.error("Usage: deno run --allow-read scripts/hybrid-sniffer.ts <pkg-path> [...]");
  Deno.exit(1);
}

let anyHybrid = false;

for (const pkgPath of args) {
  console.log(`\n## ${pkgPath}\n`);
  const reports = await analyzePackage(pkgPath);
  renderTable(reports);

  if (reports.some((r) => r.classification === "HYBRID_ROUTING")) {
    anyHybrid = true;
  }
}

if (anyHybrid) {
  console.log("\n⚠  HYBRID_ROUTING detected — review before proceeding.");
  Deno.exit(2);
} else {
  console.log("\n✓  No hybrid routing detected.");
}

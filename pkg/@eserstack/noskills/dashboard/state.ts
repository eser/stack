// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dashboard state — builds a unified view of all specs, events, and user state.
 *
 * @module
 */

import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import * as identity from "../state/identity.ts";
import * as specParser from "../spec/parser.ts";
import * as events from "./events.ts";

// =============================================================================
// Types
// =============================================================================

export type User = {
  readonly name: string;
  readonly email: string;
};

export type Question = {
  readonly id: string;
  readonly text: string;
  readonly user: string;
  readonly ts: string;
};

export type SpecSummary = {
  readonly name: string;
  readonly slug: string;
  readonly phase: schema.Phase;
  readonly description: string;
  readonly tasks: readonly {
    readonly id: string;
    readonly description: string;
    readonly done: boolean;
    readonly files?: readonly string[];
  }[];
  readonly contributors: readonly string[];
  readonly delegations: readonly schema.Delegation[];
  readonly pendingQuestions: readonly Question[];
  readonly pendingSignoffs: readonly string[];
  readonly roadmap: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly avgConfidence: number | null;
  readonly lowConfidenceItems: number;
};

export type Mention = {
  readonly id: string;
  readonly spec: string;
  readonly from: string;
  readonly to: string;
  readonly question: string;
  readonly status: "pending" | "replied";
  readonly reply?: string;
  readonly ts: string;
};

export type Signoff = {
  readonly spec: string;
  readonly role: string;
  readonly status: "pending" | "signed";
  readonly user?: string;
  readonly ts?: string;
};

export type RoleMap = Readonly<Record<string, readonly string[]>>;

export type DashboardState = {
  readonly specs: readonly SpecSummary[];
  readonly activeSpec: SpecSummary | null;
  readonly pendingMentions: readonly Mention[];
  readonly pendingSignoffs: readonly Signoff[];
  readonly recentEvents: readonly events.DashboardEvent[];
  readonly currentUser: User | null;
  readonly roles: RoleMap | null;
};

// =============================================================================
// Roadmap builder (mirrors compiler.ts but standalone)
// =============================================================================

const ROADMAP = [
  "IDLE",
  "DISCOVERY",
  "REVIEW",
  "DRAFT",
  "APPROVED",
  "EXECUTING",
  "DONE",
  "IDLE",
];

const buildRoadmap = (phase: string): string => {
  const phaseMap: Record<string, string> = {
    DISCOVERY_REFINEMENT: "REVIEW",
    SPEC_PROPOSAL: "DRAFT",
    SPEC_APPROVED: "APPROVED",
    COMPLETED: "DONE",
    BLOCKED: "EXECUTING",
  };
  const mapped = phaseMap[phase] ?? phase;
  return ROADMAP.map((p) => (p === mapped ? `[ ${p} ]` : p)).join(" → ");
};

// =============================================================================
// State Builder
// =============================================================================

/**
 * The state of a spec, picked as `resolveState` picks it: its own state file
 * when that names the spec, else the active state.json when that names it,
 * else its own file (the initial state when it has none). A spec that is
 * active but has no file of its own yet lives only in state.json.
 */
const readSummaryState = async (
  root: string,
  specName: string,
  readActiveState: () => Promise<schema.StateFile>,
): Promise<schema.StateFile> => {
  const specState = await persistence.readSpecState(root, specName);
  if (specState.spec === specName) {
    return specState;
  }

  const activeState = await readActiveState();

  return activeState.spec === specName ? activeState : specState;
};

/** Build a SpecSummary from persisted state. */
export const getSpecSummary = async (
  root: string,
  specName: string,
): Promise<SpecSummary> =>
  await summarizeSpec(root, specName, () => persistence.readState(root));

/**
 * getSpecSummary with the active state read by `readActiveState`, so
 * getState reads state.json once for all of its specs.
 */
const summarizeSpec = async (
  root: string,
  specName: string,
  readActiveState: () => Promise<schema.StateFile>,
): Promise<SpecSummary> => {
  const state = await readSummaryState(root, specName, readActiveState);

  // Parse spec.md for tasks
  const parsed = await specParser.parseSpec(root, specName);
  const completedSet = new Set(state.execution.completedTasks ?? []);

  const tasks = (parsed?.tasks ?? []).map((t) => ({
    id: t.id,
    description: t.title,
    done: completedSet.has(t.id),
    ...(t.files !== undefined && t.files.length > 0 ? { files: t.files } : {}),
  }));

  // Extract contributors from discovery answers
  const contributors = [
    ...new Set(
      state.discovery.answers
        .map((a) => ("user" in a ? (a as { user: string }).user : null))
        .filter((u): u is string => u !== null && u !== "Unknown User"),
    ),
  ];

  // Extract pending questions from notes
  const pendingQuestions: Question[] = (state.specNotes ?? [])
    .filter((n) => n.text.startsWith("[QUESTION] "))
    .map((n) => ({
      id: n.id,
      text: n.text.replace("[QUESTION] ", ""),
      user: n.user,
      ts: n.timestamp,
    }));

  // Determine timestamps
  const history = state.transitionHistory ?? [];
  const createdAt =
    history.length > 0 ? history[0]!.timestamp : new Date().toISOString();
  const updatedAt = state.lastCalledAt ?? createdAt;

  // Confidence scoring
  const findings = state.execution.confidenceFindings ?? [];
  const avgConfidence =
    findings.length > 0
      ? Math.round(
          (findings.reduce((acc, f) => acc + f.confidence, 0) /
            findings.length) *
            10,
        ) / 10
      : null;
  const lowConfidenceItems = findings.filter((f) => f.confidence < 5).length;

  return {
    name: specName,
    slug: specName,
    phase: state.phase,
    description: state.specDescription ?? "",
    tasks,
    contributors,
    delegations: state.discovery.delegations ?? [],
    pendingQuestions,
    pendingSignoffs: [],
    roadmap: buildRoadmap(state.phase),
    createdAt,
    updatedAt,
    avgConfidence,
    lowConfidenceItems,
  };
};

/** Build the full dashboard state. */
export const getState = async (root: string): Promise<DashboardState> => {
  // Load all specs
  const specStates = await persistence.listSpecStates(root);
  const specNames = new Set(specStates.map((s) => s.name));

  // Also check spec directories without state files
  try {
    const specsDir = `${root}/${persistence.paths.specsDir}`;
    for await (const entry of (
      await import("@eserstack/standards/cross-runtime")
    ).runtime.fs.readDir(specsDir)) {
      if (entry.isDirectory && !specNames.has(entry.name)) {
        specNames.add(entry.name);
      }
    }
  } catch {
    // No specs directory
  }

  // Each spec is summarized from its own files, so they load concurrently. A
  // broken spec is skipped.
  // state.json is read at most once, by the first spec that needs it.
  let activeState: Promise<schema.StateFile> | null = null;
  const readActiveState = (): Promise<schema.StateFile> =>
    (activeState ??= persistence.readState(root));

  const summaries = await Promise.all(
    [...specNames].map((name) =>
      summarizeSpec(root, name, readActiveState).catch(() => null),
    ),
  );
  const specs = summaries.filter(
    (summary): summary is SpecSummary => summary !== null,
  );

  // Sort: active specs first, then by updatedAt
  specs.sort((a, b) => {
    const aActive = a.phase !== "COMPLETED" && a.phase !== "IDLE";
    const bActive = b.phase !== "COMPLETED" && b.phase !== "IDLE";
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  // Active spec = first non-completed, non-idle spec
  const activeSpec =
    specs.find((s) => s.phase !== "COMPLETED" && s.phase !== "IDLE") ?? null;

  // Recent events
  const recentEvents = await events.readEvents(root, { limit: 50 });

  // Pending mentions from events
  const mentionEvents = recentEvents.filter((e) => e.type === "mention");
  const replyEvents = new Set(
    recentEvents
      .filter((e) => e.type === "mention-reply")
      .map((e) => e["mentionId"] as string),
  );
  const pendingMentions: Mention[] = mentionEvents
    .filter((e) => !replyEvents.has(e["id"] as string))
    .map((e) => ({
      id: (e["id"] as string) ?? "",
      spec: e.spec,
      from: (e["from"] as string) ?? e.user,
      to: (e["to"] as string) ?? "",
      question: (e["question"] as string) ?? "",
      status: "pending" as const,
      ts: e.ts,
    }));

  // Pending signoffs from events
  const signoffEvents = recentEvents.filter((e) => e.type === "signoff");
  const pendingSignoffs: Signoff[] = signoffEvents
    .filter((e) => (e["status"] as string) === "pending")
    .map((e) => ({
      spec: e.spec,
      role: (e["role"] as string) ?? "",
      status: "pending" as const,
      ts: e.ts,
    }));

  // Current user
  const user = await identity.resolveUser(root);
  const currentUser: User | null =
    user !== undefined ? { name: user.name, email: user.email } : null;

  // Roles from manifest
  const manifest = await persistence.readManifest(root);
  const roles =
    ((manifest as unknown as Record<string, unknown>)?.[
      "roles"
    ] as RoleMap | null) ?? null;

  return {
    specs,
    activeSpec,
    pendingMentions,
    pendingSignoffs,
    recentEvents,
    currentUser,
    roles,
  };
};

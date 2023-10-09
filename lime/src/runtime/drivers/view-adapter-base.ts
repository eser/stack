import type * as Preact from "preact";
import type * as PreactHooks from "preact/hooks";
import type * as React from "react";
import { type Island } from "../../server/types.ts";
export { type Island } from "../../server/types.ts";
import { RenderState } from "../../server/rendering/state.ts";
export { RenderState } from "../../server/rendering/state.ts";

export type FragmentType = typeof Preact.Fragment | typeof React.Fragment;
export type ContextBase<T> = Preact.Context<T> | React.Context<T>;
export type Context<T> = Preact.PreactContext<T> | React.Context<T>;
export type EffectCallback = () => void;
export type DependencyList = ReadonlyArray<unknown>;

// deno-lint-ignore ban-types
export type Component<P = {}, S = {}> =
  | Preact.Component<P, S>
  | React.Component<P, S>;
export type ComponentChildren =
  | Preact.ComponentChildren
  | typeof React.Children;
// deno-lint-ignore no-explicit-any
export type VNode<T = any> = Preact.VNode<T> | React.ReactElement<T>;
// deno-lint-ignore ban-types
export type ComponentType<P = {}> =
  | Preact.ComponentType<P>
  | React.ComponentType<P>;
export interface ViewAdapterBase {
  libSignals: string | null;
  libJSX: string | null;
  libAdapter: string | null;
  libAdapterDOM: string | null;
  libAdapterHooks: string | null;
  Fragment: FragmentType;

  createContext<T>(defaultValue: T): ContextBase<T>;
  useContext<T>(context: Context<T>): T;
  useEffect(callback: EffectCallback, deps?: DependencyList): void;
  useState<S>(
    initialState: S | (() => S),
  ): [S, PreactHooks.StateUpdater<S>] | [
    S,
    React.Dispatch<React.SetStateAction<S>>,
  ];

  h(
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown;
  isValidElement(object: unknown): boolean;
  toChildArray(children: unknown): unknown[];

  render(fragment: unknown, container: HTMLElement): void;
  renderHydrate(fragment: unknown, container: HTMLElement): void;
  renderToString(fragment: unknown): string;

  setAllIslands(islands: Island[]): void;
  setRenderState(state: RenderState | null): void;
}

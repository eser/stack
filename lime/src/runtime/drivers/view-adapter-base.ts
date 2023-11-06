// Copyright 2023 the cool authors. All rights reserved. MIT license.

import type * as React from "react";
import { type Island } from "../../server/types.ts";
export { type Island } from "../../server/types.ts";
import { RenderState } from "../../server/rendering/state.ts";
export { RenderState } from "../../server/rendering/state.ts";

// deno-lint-ignore ban-types, no-explicit-any
export type ComponentType<P = {}, S = {}, SS = any> = typeof React.Component<
  P,
  S,
  SS
>;
export type FragmentType = typeof React.Fragment;
export type ContextBase<T> = React.Context<T>;
export type Context<T> = React.Context<T>;
export type EffectCallback = () => void;
export type DependencyList = ReadonlyArray<unknown>;

// deno-lint-ignore ban-types
export type Component<P = {}, S = {}> = React.Component<P, S>;
export type ComponentChildren = typeof React.Children;
// deno-lint-ignore no-explicit-any
export type VNode<T = any> = React.ReactElement<T>;
export interface ViewAdapterBase {
  libSignals: string | null;
  libJSX: string | null;
  libAdapter: string | null;
  libAdapterDOM: string | null;
  libAdapterHooks: string | null;
  Component: ComponentType;
  Fragment: FragmentType;

  createContext<T>(defaultValue: T): ContextBase<T>;
  useContext<T>(context: Context<T>): T;
  useEffect(callback: EffectCallback, deps?: DependencyList): void;
  useState<S>(
    initialState: S | (() => S),
  ): [
    S,
    React.Dispatch<React.SetStateAction<S>>,
  ];

  h(
    type: unknown,
    props: Record<string, unknown> | null,
    ...children: ReadonlyArray<unknown>
  ): unknown;
  isValidElement(object: unknown): boolean;
  toChildArray(children: unknown): Array<unknown>;

  render(fragment: unknown, container: HTMLElement): void;
  renderHydrate(fragment: unknown, container: HTMLElement): void;
  renderToString(fragment: unknown): string;

  setAllIslands(islands: ReadonlyArray<Island>): void;
  setRenderState(state: RenderState | null): void;
}

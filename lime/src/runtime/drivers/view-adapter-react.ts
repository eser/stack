import {
  Children,
  Component,
  type ComponentClass,
  type Context,
  createContext,
  createElement,
  type Dispatch,
  Fragment,
  type FunctionComponent,
  isValidElement,
  type JSXElementConstructor,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useState,
} from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { setAllIslands } from "../../server/rendering/react_hooks.ts";
import {
  type DependencyList,
  type EffectCallback,
  type Island,
  type RenderState,
  type ViewAdapterBase,
} from "./view-adapter-base.ts";

export class ReactViewAdapter implements ViewAdapterBase {
  libSignals = "@preact/signals-react";
  libJSX = "react";
  libAdapter = "react";
  libAdapterDOM = "react-dom";
  libAdapterHooks = "react";
  Fragment: typeof Fragment = Fragment;
  Component: typeof Component = Component;

  createContext<T>(defaultValue: T): Context<T> {
    return createContext(defaultValue);
  }

  useContext<T>(context: Context<T>) {
    return useContext(context);
  }

  useEffect(callback: EffectCallback, deps?: DependencyList) {
    useEffect(callback, deps);
  }

  useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>] {
    return useState(initialState);
  }

  h(
    type:
      | string
      | FunctionComponent<Record<string, unknown>>
      // deno-lint-ignore no-explicit-any
      | ComponentClass<Record<string, unknown>, any>,
    props: Record<string, unknown> | null,
    ...children: ReadonlyArray<ReactNode>
  ) {
    return createElement(type, props, ...children);
  }

  // deno-lint-ignore ban-types
  isValidElement(object: {}) {
    return isValidElement(object);
  }

  toChildArray(children: ReactNode) {
    return Children.toArray(children);
  }

  render(fragment: ReactNode, container: Element | DocumentFragment) {
    const root = createRoot(container);

    root.render(fragment);
  }

  renderHydrate(
    fragment: ReactNode,
    container: Element | Document,
  ) {
    hydrateRoot(container, fragment);
  }

  renderToString(
    // deno-lint-ignore no-explicit-any
    fragment: ReactElement<any, string | JSXElementConstructor<any>>,
  ) {
    return renderToString(fragment);
  }

  setAllIslands(islands: ReadonlyArray<Island>) {
    setAllIslands(islands);
  }

  setRenderState(_state: RenderState | null) {
  }
}

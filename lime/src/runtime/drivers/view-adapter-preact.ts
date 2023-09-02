import {
  type ComponentChild,
  type ComponentChildren,
  type ComponentType,
  type ContainerNode,
  type Context,
  createContext,
  Fragment,
  h,
  hydrate,
  isValidElement,
  type PreactContext,
  render,
  type VNode,
} from "preact";
import {
  type StateUpdater,
  useContext,
  useEffect,
  useState,
} from "preact/hooks";
import { renderToString } from "preact-render-to-string";
import {
  setAllIslands,
  setRenderState,
} from "../../server/rendering/preact_hooks.ts";
import {
  type DependencyList,
  type EffectCallback,
  type Island,
  type RenderState,
  type ViewAdapterBase,
} from "./view-adapter-base.ts";

export class PreactViewAdapter implements ViewAdapterBase {
  hasSignals = true;
  Fragment: typeof Fragment = Fragment;

  createContext<T>(defaultValue: T): Context<T> {
    return createContext(defaultValue);
  }

  useContext<T>(context: PreactContext<T>) {
    return useContext(context);
  }

  useEffect(callback: EffectCallback, deps?: DependencyList) {
    useEffect(callback, deps);
  }

  useState<S>(initialState: S | (() => S)): [S, StateUpdater<S>] {
    return useState(initialState);
  }

  h(
    type: ComponentType<Record<string, unknown>>,
    props: Record<string, unknown> | null,
    ...children: ComponentChildren[]
  ) {
    return h(type, props, ...children);
  }

  // deno-lint-ignore no-explicit-any, ban-types
  isValidElement(object: any): object is VNode<{}> {
    return isValidElement(object);
  }

  render(fragment: ComponentChild, container: ContainerNode) {
    render(fragment, container);
  }

  renderHydrate(fragment: ComponentChild, container: ContainerNode) {
    hydrate(fragment, container);
  }

  // deno-lint-ignore ban-types
  renderToString(fragment: VNode<{}>) {
    return renderToString(fragment);
  }

  setAllIslands(islands: Island[]) {
    setAllIslands(islands);
  }

  setRenderState(state: RenderState | null) {
    setRenderState(state);
  }
}

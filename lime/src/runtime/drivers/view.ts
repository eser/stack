import { PreactViewAdapter } from "./view-adapter-preact.ts";
import { ReactViewAdapter } from "./view-adapter-react.ts";
import { type ViewAdapterBase } from "./view-adapter-base.ts";

// deno-lint-ignore no-explicit-any
export type ComponentChildren = any;
// deno-lint-ignore no-explicit-any
export type VNode<T = any> = any;
// deno-lint-ignore no-explicit-any
export type ComponentType = any;

export class Component {
}

export enum ViewAdapter {
  Preact = "preact",
  React = "react",
}

export class View {
  adapter: ViewAdapterBase | undefined;
  Fragment: unknown = undefined;

  constructor(adapter?: ViewAdapterBase) {
    if (adapter) {
      this.setViewAdapter(adapter);
    }
  }

  setViewAdapter(adapter: ViewAdapterBase) {
    this.adapter = adapter;
    this.Fragment = adapter.Fragment;
  }

  createContext<T>(initialValue: T): unknown | undefined {
    return this.adapter?.createContext(initialValue);
  }

  useContext<T>(context: T): unknown | undefined {
    return this.adapter?.useContext(context);
  }

  useEffect(callback: () => void, deps?: unknown[]) {
    this.adapter?.useEffect(callback, deps);
  }

  useState<T>(initialValue: T): [T, (value: T) => void] | undefined {
    return this.adapter?.useState(initialValue);
  }

  h(
    tag: string,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown | undefined {
    return this.adapter?.h(tag, props, ...children);
  }

  isValidElement(element: unknown): boolean | undefined {
    return this.adapter?.isValidElement(element);
  }

  render(fragment: unknown, target: HTMLElement): void {
    this.adapter?.render(fragment, target);
  }

  renderHydrate(fragment: unknown, target: HTMLElement): void {
    this.adapter?.renderHydrate(fragment, target);
  }

  renderToString(fragment: unknown): string | undefined {
    return this.adapter?.renderToString(fragment);
  }
}

export const setViewAdapter = (adapterName: ViewAdapter) => {
  switch (adapterName) {
    case ViewAdapter.Preact:
      view.setViewAdapter(new PreactViewAdapter());
      break;
    case ViewAdapter.React:
      view.setViewAdapter(new ReactViewAdapter());
      break;
  }
};

export const view = new View();
// TODO(@eser): Make this configurable
setViewAdapter(ViewAdapter.React);

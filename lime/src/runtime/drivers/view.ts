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

  // deno-lint-ignore no-explicit-any
  createContext<T>(initialValue: T): any {
    return this.adapter?.createContext(initialValue);
  }

  // deno-lint-ignore no-explicit-any
  useContext<T>(context: T): any {
    return this.adapter?.useContext(context);
  }

  // deno-lint-ignore no-explicit-any
  useEffect(callback: () => void, deps?: any[]) {
    this.adapter?.useEffect(callback, deps);
  }

  useState<T>(initialValue: T): [T, (value: T) => void] | undefined {
    return this.adapter?.useState(initialValue);
  }

  h(
    tag: string,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown {
    return this.adapter?.h(tag, props, ...children);
  }
}

export const view = new View();
// TODO(@eser): Make this configurable
view.setViewAdapter(new PreactViewAdapter());

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

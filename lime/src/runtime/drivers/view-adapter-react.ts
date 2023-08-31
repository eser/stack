import {
  createContext,
  createElement,
  Fragment,
  useContext,
  useEffect,
  useState,
} from "react";
import { type ViewAdapterBase } from "./view-adapter-base.ts";

export class ReactViewAdapter implements ViewAdapterBase {
  hasSignals = false;
  Fragment = Fragment;

  // deno-lint-ignore no-explicit-any
  createContext<T>(initialValue: T): any {
    return createContext(initialValue);
  }

  // deno-lint-ignore no-explicit-any
  useContext<T>(context: T): any {
    return useContext(context);
  }

  // deno-lint-ignore no-explicit-any
  useEffect(callback: () => void, deps?: any[]): void {
    useEffect(callback, deps);
  }

  useState<T>(initialValue: T): [T, (value: T) => void] {
    return useState(initialValue);
  }

  h(
    tag: string,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown {
    return createElement(tag, props, ...children);
  }
}

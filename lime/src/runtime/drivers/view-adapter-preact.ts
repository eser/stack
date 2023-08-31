import { createContext, Fragment, h } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { type ViewAdapterBase } from "./view-adapter-base.ts";

export class PreactViewAdapter implements ViewAdapterBase {
  hasSignals = true;
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
    return h(tag, props, ...children);
  }
}

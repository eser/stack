import {
  createContext,
  createElement,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useState,
} from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { type ViewAdapterBase } from "./view-adapter-base.ts";

export class ReactViewAdapter implements ViewAdapterBase {
  hasSignals = false;
  Fragment = Fragment;

  createContext<T>(initialValue: T): unknown {
    return createContext(initialValue);
  }

  useContext<T>(context: T): unknown {
    return useContext(context);
  }

  useEffect(callback: () => void, deps?: unknown[]): void {
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

  isValidElement(element: unknown): boolean {
    return isValidElement(element);
  }

  render(fragment: unknown, target: HTMLElement): void {
    const root = createRoot(target);

    root.render(fragment);
  }

  renderHydrate(fragment: unknown, target: HTMLElement): void {
    const root = hydrateRoot(target);

    root.render(fragment);
  }

  renderToString(fragment: unknown): string {
    return renderToString(fragment);
  }
}

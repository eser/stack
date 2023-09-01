import { createContext, Fragment, h, isValidElement, render } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { renderToString } from "preact-render-to-string";
import { type ViewAdapterBase } from "./view-adapter-base.ts";

export class PreactViewAdapter implements ViewAdapterBase {
  hasSignals = true;
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
    return h(tag, props, ...children);
  }

  isValidElement(element: unknown): boolean {
    return isValidElement(element);
  }

  render(fragment: unknown, target: HTMLElement): void {
    render(fragment, target);
  }

  renderHydrate(fragment: unknown, target: HTMLElement): void {
    render(fragment, target);
  }

  renderToString(fragment: unknown): string {
    return renderToString(fragment);
  }
}

export interface ViewAdapterBase {
  hasSignals: boolean;
  Fragment: unknown;

  createContext<T>(initialValue: T): unknown;
  useContext<T>(context: T): unknown;
  useEffect(callback: () => void, deps?: unknown[]): void;
  useState<T>(initialValue: T): [T, (value: T) => void];

  h(
    tag: string,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown;
  isValidElement(element: unknown): boolean;

  render(fragment: unknown, target: HTMLElement): void;
  renderHydrate(fragment: unknown, target: HTMLElement): void;
  renderToString(fragment: unknown): string;
}

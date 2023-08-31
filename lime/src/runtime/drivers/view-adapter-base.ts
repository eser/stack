export interface ViewAdapterBase {
  hasSignals: boolean;
  Fragment: unknown;

  // deno-lint-ignore no-explicit-any
  createContext<T>(initialValue: T): any;
  // deno-lint-ignore no-explicit-any
  useContext<T>(context: T): any;
  // deno-lint-ignore no-explicit-any
  useEffect(callback: () => void, deps?: any[]): void;
  useState<T>(initialValue: T): [T, (value: T) => void];
  h(
    tag: string,
    props: Record<string, unknown> | null,
    ...children: unknown[]
  ): unknown;
}

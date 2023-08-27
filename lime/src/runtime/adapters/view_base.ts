export interface ViewAdapterBase {
  // deno-lint-ignore no-explicit-any
  getCreateContext<T>(initialValue: T): any;
  // deno-lint-ignore no-explicit-any
  getUseContext(): any;

  hasSignals: boolean;
}

export interface Module {
  name?: string;

  manifest: unknown; // TODO(@eser): type this

  uses?: ReadonlyArray<string>; // TODO(@eser): type this
  provides: ReadonlyArray<unknown>; // TODO(@eser): type this

  entrypoint: () => void; // TODO(@eser): type this
}

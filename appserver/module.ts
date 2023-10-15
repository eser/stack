export interface Module {
  name?: string;

  manifest: unknown; // TODO(@eser): type this

  uses?: string[]; // TODO(@eser): type this
  provides: unknown[]; // TODO(@eser): type this

  entrypoint: () => void; // TODO(@eser): type this
}

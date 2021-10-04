import type Platform from "./platform.ts";

interface Environment {
  vars: Record<string, string>;
  platforms: Array<Platform>;

  addPlatform: (platform: Platform) => void;
}

function environment(
  initial: Pick<Environment, "vars" | "platforms">,
): Environment {
  const instance = {
    vars: initial?.vars ?? {},
    platforms: initial?.platforms ?? [],

    addPlatform: function (platform: Platform): void {
      this.platforms = [...this.platforms, platform];
    },
  };

  return instance;
}

export { environment as default };

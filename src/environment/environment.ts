import type Platform from "./platform.ts";

interface Environment {
  platforms: Array<Platform>;

  addPlatform: (platform: Platform) => void;
}

function environment(initial: Pick<Environment, "platforms">): Environment {
  return {
    platforms: initial?.platforms ?? [],

    addPlatform: function (platform: Platform): void {
      this.platforms = [...this.platforms, platform];
    },
  };
}

export { environment as default };

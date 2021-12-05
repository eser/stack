import type Platform from "./platform.ts";

interface EnvironmentOptions {
	vars: Record<string, string>;
	platforms: Array<Platform>;
}

interface Environment extends EnvironmentOptions {
	addPlatform: (platform: Platform) => void;
}

const environment = function environment(
	options: EnvironmentOptions,
): Environment {
	const instance = {
		vars: options?.vars ?? {},
		platforms: options?.platforms ?? [],

		addPlatform: function (platform: Platform): void {
			this.platforms = [...this.platforms, platform];
		},
	};

	return instance;
};

export { environment, environment as default };

import { deepMerge } from "../../fp/deep-merge.ts";

export interface Config {
  react?: {
    strictMode?: boolean;
  };

  compilation?: {
    minify?: boolean;
    sourceMaps?: boolean;
  };

  constants?: Record<string, string>;

  app?: {
    baseDir?: string;
    startRoute?: string;
    extensions?: string[];
  };

  urls?: {
    structure?: string;
    rewrites?: {
      source: string;
      destination: string;
    }[];
  };

  i18n?: {
    mode?: string;
    languages?: string[];
  };
}

export const defaultConfig: Config = {
  react: {
    strictMode: false,
  },

  compilation: {
    minify: false,
    sourceMaps: false,
  },

  constants: {
    "site-name": "cool",
    "site-description":
      "cool is a free and open source project that helps you build your next web application.",
    "site-url": "https://deno.land/x/cool",
    "twitter-handle": "@denocool",
  },

  app: {
    baseDir: "./src/app/",
    // startRoute: "/en/home",
    startRoute: "/home",
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mdx", ".md"],
  },

  urls: {
    // structure: "/[lang]/[...path]",
    structure: "/[...path]",
    rewrites: [],
  },

  i18n: {
    mode: "url",
    languages: [
      "en",
    ],
  },
};

export const makeConfig = (config: Config) => {
  const newConfig = deepMerge(defaultConfig, config);

  return newConfig;
};

export const readConfig = async (baseDir: string) => {
  const variations = [
    `${baseDir}/cool.config.ts`,
    `${baseDir}/cool.config.js`,
  ];

  let config;
  for (const variation of variations) {
    try {
      config = (await import(variation))?.default;

      break;
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) {
        throw err;
      }

      // otherwise, do nothing
    }
  }

  if (config === undefined) {
    return defaultConfig;
  }

  return makeConfig(config);
};

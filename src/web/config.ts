import { deepMerge } from "../fp/deep-merge.ts";

interface Config {
  react?: {
    strictMode?: boolean;
  };

  compilation?: {
    minify?: boolean;
    sourceMaps?: boolean;
  };

  constants?: Record<string, string>;

  pages?: {
    baseDir?: string;
    startRoute?: string;
    extensions?: string[];
  };

  i18n?: {
    mode?: string;
    languages?: string[];
  };

  rewrites?: {
    source: string;
    destination: string;
  }[];
}

const defaultConfig: Config = {
  react: {
    strictMode: false,
  },

  compilation: {
    minify: false,
    sourceMaps: false,
  },

  constants: {
    "site-name": "hex",
    "site-description":
      "hex is a free and open source project that helps you build your next web application.",
    "site-url": "https://deno.land/x/hex",
    "twitter-handle": "@denohex",
  },

  pages: {
    baseDir: "./src/",
    startRoute: "home",
    extensions: [".tsx", ".ts", ".jsx", ".js", ".mdx", ".md"],
  },

  i18n: {
    mode: "url",
    languages: [
      "en",
    ],
  },

  rewrites: [],
};

const makeConfig = (config: Config) => {
  const newConfig = deepMerge(defaultConfig, config);

  return newConfig;
};

export { type Config, defaultConfig, makeConfig };

import { type Registry } from "../types.ts";

const echoAction = (r: Registry, slug: string) => {
  const { test } = r.getMany("test");

  return {
    message: `Hello ${slug}! Testing ${test}...`,
    timestamp: new Date().toLocaleDateString(),
  };
};

export { echoAction, echoAction as default };

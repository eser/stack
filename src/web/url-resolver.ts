import { assert } from "https://deno.land/std@0.153.0/_util/assert.ts";
import { type Config } from "./config.ts";

const applyPattern = function applyPattern(
  url: string,
  variables: Record<string, string>,
): string {
  return url.replaceAll(/\[([^\]]+)\]/g, (match: string, variable) => {
    if (variables[variable]) {
      return applyPattern(variables[variable], variables);
    }

    return match;
  });
};

const applyRewrites = function applyRewrites(
  url: string,
  _rewrites: { source: string; destination: string }[],
): string {
  // TODO
  return url;
};

const applyAll = function applyAll(
  url: string,
  variables: Record<string, string>,
  rewrites: { source: string; destination: string }[],
): string {
  return applyRewrites(
    applyPattern(url, variables),
    rewrites,
  );
};

const leadingSlashAndSpaceTrimmer = function leadingSlashAndSpaceTrimmer(
  urlPart: string,
): string {
  return urlPart.replace(/^[\s\/]+/, "");
};

interface UrlResolution {
  url: string;
  route: string;
  parameters: Record<string, string>;
}

const escapeRegExp = function escapeRegex(input: string) {
  // $& means the whole matched string
  return input.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
};

const routesToRegExp = function routesToRegExp(route: string) {
  const splitterRegExp = /\[[^\]]+\]|[^\s|\[]+/g;

  const routeParts = route.match(splitterRegExp);

  assert(routeParts !== null, `unable to parse route: ${route}`);

  const splittedRegExp = routeParts.map(
    (routePart) => {
      // it's a [variable] or [...variable]
      if (routePart.startsWith("[") && routePart.endsWith("]")) {
        const variable = routePart.slice(1, -1);

        if (variable.startsWith("...")) {
          return `(?<${variable.substring(3)}>.*)`;
        }

        return `(?<${variable}>[^\\/]+)`;
      }

      return escapeRegExp(routePart);
    },
  );

  const routeRegExp = new RegExp(splittedRegExp.join(""));

  return routeRegExp;
};

// TODO not yet
const _compileRoutes = function compileRoutes(
  routes: string[],
): Record<string, RegExp> {
  return routes.reduce(
    (acc, curr) => ({ ...acc, [curr]: routesToRegExp(curr) }),
    {},
  );
};

const routeMatcher = function routeMatcher(
  route: string,
  url: string,
): UrlResolution | undefined {
  const routeRegExp = routesToRegExp(route);

  const matches = routeRegExp.exec(url);

  if (matches === null) {
    return undefined;
  }

  return {
    url,
    route,
    parameters: { ...matches.groups },
  };
};

const urlResolver = function urlResolver(
  url: string,
  routes: string[],
  config: Config,
) {
  const urlStructure = config.urls?.structure!;

  assert(
    urlStructure.startsWith("/"),
    `config.urls.structure value must start with /.
example: /[lang]/[...path]
current: ${urlStructure}`,
  );

  const variables = {};

  for (const route of routes) {
    const route_ = applyAll(
      urlStructure,
      {
        ...variables,
        "...path": leadingSlashAndSpaceTrimmer(route),
      },
      config.urls?.rewrites!,
    );

    const matchResult = routeMatcher(route_, url);

    if (matchResult !== undefined) {
      return matchResult;
    }
  }

  return undefined;
};

export { urlResolver, urlResolver as default };

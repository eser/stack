import { asserts } from "./deps.ts";
import { type Config } from "./config.ts";

const applyPattern = (
  url: string,
  variables: Record<string, string>,
): string => {
  return url.replaceAll(/\[([^\]]+)\]/g, (match: string, variable) => {
    if (variables[variable]) {
      return applyPattern(variables[variable], variables);
    }

    return match;
  });
};

const applyRewrites = (
  url: string,
  _rewrites: { source: string; destination: string }[],
): string => {
  // TODO
  return url;
};

const applyAll = (
  url: string,
  variables: Record<string, string>,
  rewrites: { source: string; destination: string }[],
): string => {
  return applyRewrites(
    applyPattern(url, variables),
    rewrites,
  );
};

const leadingSlashAndSpaceTrimmer = (
  urlPart: string,
): string => {
  return urlPart.replace(/^[\s\/]+/, "");
};

interface UrlResolution {
  url: string;
  route: string;
  parameters: Record<string, string>;
}

const escapeRegExp = (input: string) => {
  // $& means the whole matched string
  return input.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
};

const routesToRegExp = (route: string) => {
  const splitterRegExp = /\[[^\]]+\]|[^\s|\[]+/g;

  const routeParts = route.match(splitterRegExp);

  asserts.assert(routeParts !== null, `unable to parse route: ${route}`);

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
const _compileRoutes = (
  routes: string[],
): Record<string, RegExp> => {
  return routes.reduce(
    (acc, curr) => ({ ...acc, [curr]: routesToRegExp(curr) }),
    {},
  );
};

const routeMatcher = (
  route: string,
  url: string,
): UrlResolution | undefined => {
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

const urlResolver = (
  url: string,
  routes: string[],
  config: Config,
) => {
  const urlStructure = config.urls?.structure!;

  asserts.assert(
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

import { type CodebaseItem } from "../codebase/mapper.ts";

const transformCodebaseMapToRoutes = (
  pathElements: string[],
  codebaseMapNode: CodebaseItem,
): string[] => {
  let paths: string[] = [];

  if (!codebaseMapNode.isCatchAllRoute) {
    for (const subnode of codebaseMapNode.subpaths) {
      const subpaths = transformCodebaseMapToRoutes(
        [...pathElements, subnode.name],
        subnode.items,
      );

      paths = [...paths, ...subpaths];
    }
  }

  if (codebaseMapNode.handlers.length > 0) {
    paths = [...paths, `/${pathElements.join("/")}`];
  }

  return paths;
};

export {
  transformCodebaseMapToRoutes,
  transformCodebaseMapToRoutes as default,
};

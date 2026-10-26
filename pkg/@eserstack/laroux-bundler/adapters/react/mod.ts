// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React Framework Adapter
 * React Server Components (RSC) support for Laroux bundler
 */

export { reactPlugin } from "./plugin.ts";

// RSC analysis
export {
  analyzeClientComponents,
  type ClientComponent,
  type DirectiveAnalysisOptions,
  type DirectiveMatch,
  getAllComponents,
} from "./rsc-analyze.ts";

// RSC module map
export {
  type BaseModuleEntry,
  type BaseModuleMap,
  createBundlerConfig,
  createClientManifest,
  generateModuleMap,
  loadModuleMap,
  type ModuleMap,
  type ModuleMapEntry,
  saveModuleMap,
} from "./rsc-module-map.ts";

// RSC transformation
export {
  createImportMapping,
  generateTransformManifest,
  transformAllClientComponents,
  transformClientComponent,
  type TransformResult,
} from "./rsc-transform.ts";

// RSC import rewriting
export {
  createClientComponentMap,
  createCSSModuleMap,
  type ImportRewriteResult,
  rewriteAllClientComponentCSSImports,
  rewriteAllServerComponents,
  rewriteAllSrcCSSModuleImports,
  rewriteServerComponentImports,
} from "./rsc-rewrite-imports.ts";

// Client entry generation
export { createClientEntry } from "./rsc-client-entry.ts";

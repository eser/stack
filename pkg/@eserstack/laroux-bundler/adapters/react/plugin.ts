// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React Framework Plugin for Laroux Bundler
 *
 * Implements the FrameworkPlugin interface to provide React-specific
 * build functionality including React Server Components (RSC) support.
 */

import type {
  ClientComponent,
  FrameworkPlugin,
  ModuleMap,
  TransformResult,
} from "../../domain/framework-plugin.ts";
import type { BuildCache } from "../../domain/build-cache.ts";

// Import RSC implementations
import {
  analyzeClientComponents as analyzeClientComponentsImpl,
  getAllComponents as getAllComponentsImpl,
} from "./rsc-analyze.ts";
import {
  generateTransformManifest as generateTransformManifestImpl,
  transformAllClientComponents as transformAllClientComponentsImpl,
} from "./rsc-transform.ts";
import {
  createClientManifest as createClientManifestImpl,
  generateModuleMap as generateModuleMapImpl,
  type ModuleMap as RscModuleMap,
  saveModuleMap as saveModuleMapImpl,
} from "./rsc-module-map.ts";
import {
  rewriteAllServerComponents as rewriteAllServerComponentsImpl,
  rewriteAllSrcCSSModuleImports as rewriteAllSrcCSSModuleImportsImpl,
} from "./rsc-rewrite-imports.ts";
import { createClientEntry as createClientEntryImpl } from "./rsc-client-entry.ts";

/**
 * React framework plugin for Laroux bundler
 *
 * Provides React Server Components (RSC) support:
 * - "use client" directive analysis
 * - Client component proxy generation
 * - Module map for client/server communication
 * - Import rewriting for bundling
 */
export const reactPlugin: FrameworkPlugin = {
  name: "react",

  analyzeClientComponents: async (
    srcDir: string,
    projectRoot: string,
    cache?: BuildCache,
  ): Promise<ClientComponent[]> => {
    return await analyzeClientComponentsImpl(srcDir, projectRoot, cache);
  },

  getAllComponents: async (srcDir: string): Promise<string[]> => {
    return await getAllComponentsImpl(srcDir);
  },

  transformClientComponents: async (
    components: ClientComponent[],
    outputDir: string,
    projectRoot: string,
  ): Promise<TransformResult[]> => {
    const results = await transformAllClientComponentsImpl(
      components,
      outputDir,
      projectRoot,
    );
    // Map RSC TransformResult to framework-plugin TransformResult
    return results.map((r) => ({
      originalPath: r.originalPath,
      transformedPath: r.transformedPath,
    }));
  },

  generateTransformManifest: async (
    transformResults: TransformResult[],
    outputPath: string,
    projectRoot: string,
  ): Promise<void> => {
    await generateTransformManifestImpl(
      transformResults,
      outputPath,
      projectRoot,
    );
  },

  createModuleMap: (
    components: ClientComponent[],
  ): Promise<ModuleMap> => {
    // RSC's generateModuleMap returns Record<string, ModuleMapEntry>
    // which matches our ModuleMap type
    return Promise.resolve(generateModuleMapImpl(components));
  },

  saveModuleMap: async (
    moduleMap: ModuleMap,
    outputPath: string,
  ): Promise<void> => {
    await saveModuleMapImpl(moduleMap as RscModuleMap, outputPath);
  },

  createClientManifest: (
    components: ClientComponent[],
  ): Promise<ModuleMap> => {
    return Promise.resolve(createClientManifestImpl(components));
  },

  rewriteServerComponents: async (
    serverComponentPaths: string[],
    transformResults: TransformResult[],
    cssModulePaths: string[],
    outputDir: string,
    projectRoot: string,
  ): Promise<void> => {
    await rewriteAllServerComponentsImpl(
      serverComponentPaths,
      transformResults,
      cssModulePaths,
      outputDir,
      projectRoot,
    );
  },

  rewriteCssModuleImports: async (
    srcDir: string,
    cssModulePaths: string[],
    projectRoot: string,
  ): Promise<void> => {
    await rewriteAllSrcCSSModuleImportsImpl(
      srcDir,
      cssModulePaths,
      projectRoot,
    );
  },

  createClientEntry: async (
    components: ClientComponent[],
    projectRoot: string,
    distDir: string,
  ): Promise<string> => {
    return await createClientEntryImpl(components, projectRoot, distDir);
  },
};

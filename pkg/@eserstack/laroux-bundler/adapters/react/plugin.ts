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
import type { ClientComponentCache } from "../../domain/build-cache.ts";

// Import RSC implementations
import * as rscAnalyze from "./rsc-analyze.ts";
import * as rscTransform from "./rsc-transform.ts";
import * as rscModuleMap from "./rsc-module-map.ts";
import type { ModuleMap as RscModuleMap } from "./rsc-module-map.ts";
import * as rscRewriteImports from "./rsc-rewrite-imports.ts";
import * as rscClientEntry from "./rsc-client-entry.ts";

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
    cache?: ClientComponentCache,
  ): Promise<ClientComponent[]> => {
    return await rscAnalyze.analyzeClientComponents(srcDir, projectRoot, cache);
  },

  getAllComponents: async (srcDir: string): Promise<string[]> => {
    return await rscAnalyze.getAllComponents(srcDir);
  },

  transformClientComponents: async (
    components: ClientComponent[],
    outputDir: string,
    projectRoot: string,
  ): Promise<TransformResult[]> => {
    const results = await rscTransform.transformAllClientComponents(
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
    await rscTransform.generateTransformManifest(
      transformResults,
      outputPath,
      projectRoot,
    );
  },

  createModuleMap: (components: ClientComponent[]): Promise<ModuleMap> => {
    // RSC's generateModuleMap returns Record<string, ModuleMapEntry>
    // which matches our ModuleMap type
    return Promise.resolve(rscModuleMap.generateModuleMap(components));
  },

  saveModuleMap: async (
    moduleMap: ModuleMap,
    outputPath: string,
  ): Promise<void> => {
    await rscModuleMap.saveModuleMap(moduleMap as RscModuleMap, outputPath);
  },

  createClientManifest: (components: ClientComponent[]): Promise<ModuleMap> => {
    return Promise.resolve(rscModuleMap.createClientManifest(components));
  },

  rewriteServerComponents: async (
    serverComponentPaths: string[],
    transformResults: TransformResult[],
    cssModulePaths: string[],
    outputDir: string,
    projectRoot: string,
  ): Promise<void> => {
    await rscRewriteImports.rewriteAllServerComponents(
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
    await rscRewriteImports.rewriteAllSrcCSSModuleImports(
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
    return await rscClientEntry.createClientEntry(
      components,
      projectRoot,
      distDir,
    );
  },
};

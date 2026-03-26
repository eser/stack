// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "./types.ts";
import type * as config from "./config.ts";
import * as configModule from "./config.ts";
import type * as model from "./model.ts";
import * as errors from "./errors.ts";

// =============================================================================
// Registry Options
// =============================================================================

export type RegistryOptions = {
  readonly factories?: readonly model.ProviderFactory[];
};

// =============================================================================
// Registry
// =============================================================================

export class Registry {
  private readonly models = new Map<string, model.LanguageModel>();
  private readonly factories = new Map<string, model.ProviderFactory>();

  constructor(options?: RegistryOptions) {
    if (options?.factories !== undefined) {
      for (const factory of options.factories) {
        this.factories.set(factory.provider, factory);
      }
    }
  }

  registerFactory(factory: model.ProviderFactory): void {
    this.factories.set(factory.provider, factory);
  }

  async addModel(
    name: string,
    target: config.ConfigTarget,
  ): Promise<model.LanguageModel> {
    if (this.models.has(name)) {
      throw new errors.ModelAlreadyExistsError(name);
    }

    const factory = this.factories.get(target.provider);

    if (factory === undefined) {
      throw new errors.UnsupportedProviderError(target.provider);
    }

    const resolved = configModule.withDefaults(target);
    const languageModel = await factory.createModel(resolved);

    this.models.set(name, languageModel);

    return languageModel;
  }

  async removeModel(name: string): Promise<void> {
    const languageModel = this.models.get(name);

    if (languageModel === undefined) {
      throw new errors.ModelNotFoundError(name);
    }

    await languageModel.close();
    this.models.delete(name);
  }

  getDefault(): model.LanguageModel | null {
    const defaultModel = this.models.get("default");

    if (defaultModel !== undefined) {
      return defaultModel;
    }

    // Fall back to first registered model
    const first = this.models.values().next();

    if (first.done === true) {
      return null;
    }

    return first.value;
  }

  getNamed(name: string): model.LanguageModel | null {
    return this.models.get(name) ?? null;
  }

  getByProvider(provider: string): readonly model.LanguageModel[] {
    const result: model.LanguageModel[] = [];

    for (const languageModel of this.models.values()) {
      if (languageModel.provider === provider) {
        result.push(languageModel);
      }
    }

    return result;
  }

  getByCapability(
    capability: types.ProviderCapability,
  ): readonly model.LanguageModel[] {
    const result: model.LanguageModel[] = [];

    for (const languageModel of this.models.values()) {
      if (languageModel.capabilities.includes(capability)) {
        result.push(languageModel);
      }
    }

    return result;
  }

  listModels(): readonly string[] {
    return [...this.models.keys()];
  }

  listRegisteredProviders(): readonly string[] {
    return [...this.factories.keys()];
  }

  async loadFromConfig(cfg: config.Config): Promise<void> {
    const entries = Object.entries(cfg.targets);

    for (const [name, target] of entries) {
      await this.addModel(name, target);
    }
  }

  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const languageModel of this.models.values()) {
      closePromises.push(languageModel.close());
    }

    await Promise.all(closePromises);
    this.models.clear();
  }
}

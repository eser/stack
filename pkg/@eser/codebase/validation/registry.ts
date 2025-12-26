// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Validator registry with lazy initialization
 *
 * @module
 */

import type { Validator } from "./types.ts";

// Registry state (lazy initialized)
type RegistryState = {
  validators: Map<string, Validator>;
  initialized: boolean;
};

const state: RegistryState = {
  validators: new Map(),
  initialized: false,
};

// Import validators lazily to avoid circular dependencies
const initializeBuiltinValidators = async (): Promise<void> => {
  const { circularDepsValidator } = await import(
    "./validators/circular-deps.ts"
  );
  const { modExportsValidator } = await import("./validators/mod-exports.ts");
  const { exportNamesValidator } = await import("./validators/export-names.ts");
  const { docsValidator } = await import("./validators/docs.ts");
  const { licensesValidator } = await import("./validators/licenses.ts");
  const { packageConfigsValidator } = await import(
    "./validators/package-configs.ts"
  );

  registerValidator(circularDepsValidator);
  registerValidator(modExportsValidator);
  registerValidator(exportNamesValidator);
  registerValidator(docsValidator);
  registerValidator(licensesValidator);
  registerValidator(packageConfigsValidator);
};

/**
 * Ensure the registry is initialized with built-in validators
 */
const ensureInitialized = async (): Promise<void> => {
  if (state.initialized) {
    return;
  }
  state.initialized = true;
  await initializeBuiltinValidators();
};

/**
 * Register a validator in the registry
 *
 * @param validator - The validator to register
 */
export const registerValidator = (validator: Validator): void => {
  state.validators.set(validator.name, validator);
};

/**
 * Get a validator by name
 *
 * @param name - The validator name
 * @returns The validator or null if not found
 */
export const getValidator = async (name: string): Promise<Validator | null> => {
  await ensureInitialized();
  return state.validators.get(name) ?? null;
};

/**
 * Get all registered validators
 *
 * @returns Array of all validators
 */
export const getValidators = async (): Promise<readonly Validator[]> => {
  await ensureInitialized();
  return [...state.validators.values()];
};

/**
 * Get validator names
 *
 * @returns Array of validator names
 */
export const getValidatorNames = async (): Promise<readonly string[]> => {
  await ensureInitialized();
  return [...state.validators.keys()];
};

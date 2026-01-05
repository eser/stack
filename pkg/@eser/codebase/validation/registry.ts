// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Validator registry with lazy initialization
 *
 * @module
 */

import type { Validator } from "./types.ts";
import { circularDepsValidator } from "./validators/circular-deps.ts";
import { modExportsValidator } from "./validators/mod-exports.ts";
import { exportNamesValidator } from "./validators/export-names.ts";
import { docsValidator } from "./validators/docs.ts";
import { licensesValidator } from "./validators/licenses.ts";
import { packageConfigsValidator } from "./validators/package-configs.ts";

// Registry state (lazy initialized)
type RegistryState = {
  validators: Map<string, Validator>;
  initialized: boolean;
};

const state: RegistryState = {
  validators: new Map(),
  initialized: false,
};

// Initialize built-in validators
const initializeBuiltinValidators = (): void => {
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
const ensureInitialized = (): void => {
  if (state.initialized) {
    return;
  }
  state.initialized = true;
  initializeBuiltinValidators();
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
export const getValidator = (name: string): Validator | null => {
  ensureInitialized();
  return state.validators.get(name) ?? null;
};

/**
 * Get all registered validators
 *
 * @returns Array of all validators
 */
export const getValidators = (): readonly Validator[] => {
  ensureInitialized();
  return [...state.validators.values()];
};

/**
 * Get validator names
 *
 * @returns Array of validator names
 */
export const getValidatorNames = (): readonly string[] => {
  ensureInitialized();
  return [...state.validators.keys()];
};

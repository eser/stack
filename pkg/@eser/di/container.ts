// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as promises from "@eser/standards/promises";
import * as functions from "@eser/standards/functions";
import {
  type PromisableBuilder,
  type ServiceDescriptor,
  type ServiceKey,
  type ServiceRegistry,
  type ServiceResolution,
  type ServiceScope,
  ServiceTypes,
  type ServiceValue,
} from "./primitives.ts";
import { invoke } from "./invoker.ts";

/**
 * Validates a service token to ensure it's not null, undefined, or an empty string.
 *
 * @param token The service token to validate
 * @throws {Error} If token is invalid
 */
const validateServiceToken = <K>(token: K): void => {
  if (token == null) {
    throw new Error("Service token cannot be null or undefined");
  }
  if (typeof token === "string" && token.trim() === "") {
    throw new Error("Service token cannot be an empty string");
  }
};

/**
 * Service registry that manages service descriptors and their lifecycles.
 *
 * The registry supports four types of service registrations:
 * - Singleton: Same instance shared across all requests
 * - Lazy: Created once when first requested, then reused (application-scoped)
 * - Scoped: Created once per scope, reused within the same scope
 * - Transient: New instance created for each request
 *
 * @template K The type of service keys/tokens
 * @template V The type of service values
 *
 * @example
 * ```ts
 * const registry = new Registry<string, any>()
 *   .set("config", { apiUrl: "https://api.example.com" })
 *   .setLazy("database", (scope) => new DatabaseConnection())
 *   .setScoped("logger", (scope) => new Logger())
 *   .setTransient("uuid", () => crypto.randomUUID());
 *
 * const scope = registry.build();
 * const config = scope.get("config");
 * ```
 */
export class Registry<K = ServiceKey, V = ServiceValue>
  implements ServiceRegistry<K, V> {
  /** Map of service tokens to their descriptors */
  descriptors: Map<K, ServiceDescriptor<V>> = new Map<
    K,
    ServiceDescriptor<V>
  >();

  /**
   * Register a singleton service that will have the same instance shared across all requests.
   *
   * @param token The service identifier
   * @param value The service instance or a promise resolving to the instance
   * @returns This registry instance for method chaining
   * @throws {Error} If token is null, undefined, or empty string
   */
  set(token: K, value: promises.Promisable<V>): this {
    validateServiceToken(token);
    this.descriptors.set(token, [ServiceTypes.Singleton, value]);
    return this;
  }

  /**
   * Register a lazy service that will be created once when first requested and then reused.
   * The service is scoped to the root application scope.
   *
   * @param token The service identifier
   * @param value Factory function that creates the service instance
   * @returns This registry instance for method chaining
   * @throws {Error} If token is null, undefined, empty string, or value is not a function
   */
  setLazy(token: K, value: PromisableBuilder<V>): this {
    validateServiceToken(token);
    if (typeof value !== "function") {
      throw new Error("Lazy service value must be a factory function");
    }
    this.descriptors.set(token, [ServiceTypes.Lazy, value]);
    return this;
  }

  /**
   * Register a scoped service that will be created once per scope and reused within that scope.
   * Each new scope will get its own instance.
   *
   * @param token The service identifier
   * @param value Factory function that creates the service instance
   * @returns This registry instance for method chaining
   * @throws {Error} If token is null, undefined, empty string, or value is not a function
   */
  setScoped(token: K, value: PromisableBuilder<V>): this {
    validateServiceToken(token);
    if (typeof value !== "function") {
      throw new Error("Scoped service value must be a factory function");
    }
    this.descriptors.set(token, [ServiceTypes.Scoped, value]);
    return this;
  }

  /**
   * Register a transient service that will create a new instance for each request.
   *
   * @param token The service identifier
   * @param value Factory function that creates the service instance
   * @returns This registry instance for method chaining
   * @throws {Error} If token is null, undefined, empty string, or value is not a function
   */
  setTransient(token: K, value: PromisableBuilder<V>): this {
    validateServiceToken(token);
    if (typeof value !== "function") {
      throw new Error("Transient service value must be a factory function");
    }
    this.descriptors.set(token, [ServiceTypes.Transient, value]);
    return this;
  }

  /**
   * Build a service scope from this registry that can be used to resolve services.
   *
   * @returns A new service scope
   */
  build(): ServiceScope<K, V> {
    return new Scope<K, V>(this as ServiceRegistry<K, V>);
  }
}

/**
 * Service resolution scope that handles service instantiation and lifetime management.
 *
 * A scope maintains instances of scoped services and provides access to the service registry.
 * Child scopes share the same registry but maintain their own scoped service instances.
 *
 * @template K The type of service keys/tokens
 * @template V The type of service values
 *
 * @example
 * ```ts
 * const registry = new Registry()
 *   .setScoped("requestId", () => crypto.randomUUID())
 *   .setLazy("database", () => new DatabaseConnection());
 *
 * const scope = registry.build();
 * const requestId1 = scope.get("requestId"); // Creates new UUID
 * const requestId2 = scope.get("requestId"); // Returns same UUID
 *
 * const childScope = scope.createScope();
 * const requestId3 = childScope.get("requestId"); // Creates different UUID
 * ```
 */
export class Scope<K = ServiceKey, V = ServiceValue>
  implements ServiceScope<K, V> {
  /** The service registry containing service descriptors */
  readonly registry: ServiceRegistry<K, V>;
  /** Reference to the root scope for lazy services */
  readonly rootScope: ServiceScope<K, V>;
  /** Map of resolved scoped service instances */
  readonly items: Map<K, ServiceResolution<V>>;

  /**
   * Create a new service scope.
   *
   * @param registry The service registry to use for service resolution
   * @param parent Optional parent scope (defaults to self for root scope)
   */
  constructor(
    registry: ServiceRegistry<K, V>,
    parent?: ServiceScope<K, V>,
  ) {
    this.registry = registry;
    this.rootScope = parent ?? this;
    this.items = new Map<K, ServiceResolution<V>>();
  }

  /**
   * Resolve a service from the registry, respecting its configured lifetime.
   *
   * - Singleton: Returns the registered instance directly
   * - Lazy: Creates once in root scope, then reuses
   * - Scoped: Creates once per scope, then reuses within that scope
   * - Transient: Creates new instance on every call
   *
   * @param token The service identifier to resolve
   * @param defaultValue Optional default value if service is not registered
   * @returns The resolved service instance or promise, or the default value
   */
  get<V2 extends V = V>(token: K, defaultValue?: V2): ServiceResolution<V2> {
    const descriptor = this.registry.descriptors.get(token);

    if (descriptor === undefined) {
      return defaultValue;
    }

    if (descriptor[0] === ServiceTypes.Singleton) {
      return descriptor[1] as promises.Promisable<V2>;
    }

    if (
      descriptor[0] === ServiceTypes.Lazy ||
      descriptor[0] === ServiceTypes.Scoped
    ) {
      const targetScope = (descriptor[0] === ServiceTypes.Scoped)
        ? this
        : this.rootScope;
      const stored = targetScope.items.get(token);

      if (stored !== undefined) {
        return stored as ServiceResolution<V2>;
      }

      const value = descriptor[1] as PromisableBuilder<V>;

      try {
        const result = value(this);

        if (result instanceof Promise) {
          // Cache the promise itself to avoid creating multiple promises for concurrent requests
          const cachedPromise = result.then((resolved) => {
            // Replace the promise with the resolved value in cache
            targetScope.items.set(token, resolved);
            return resolved;
          }).catch((error) => {
            // Remove failed promise from cache so it can be retried
            targetScope.items.delete(token);
            const errorMessage = error instanceof Error
              ? error.message
              : String(error);
            throw new Error(
              `Failed to resolve service '${String(token)}': ${errorMessage}`,
            );
          });

          // Cache the promise immediately to prevent duplicate factory calls
          targetScope.items.set(token, cachedPromise as ServiceResolution<V>);
          return cachedPromise as ServiceResolution<V2>;
        }

        targetScope.items.set(token, result);
        return result as ServiceResolution<V2>;
      } catch (error) {
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        throw new Error(
          `Failed to resolve service '${String(token)}': ${errorMessage}`,
        );
      }
    }

    // Transient services - create new instance every time
    const value = descriptor[1] as PromisableBuilder<V>;

    try {
      const result = value(this);
      return result as ServiceResolution<V2>;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      throw new Error(
        `Failed to resolve transient service '${
          String(token)
        }': ${errorMessage}`,
      );
    }
  }

  /**
   * Resolve multiple services at once.
   *
   * @param tokens The service identifiers to resolve
   * @returns Array of resolved service instances
   */
  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>> {
    return tokens.map((token) => this.get(token));
  }

  /**
   * Invoke a function with automatic dependency injection.
   * The function's parameters will be resolved from the service registry.
   *
   * @param fn The function to invoke with dependency injection
   * @returns The function's return value
   */
  // deno-lint-ignore no-explicit-any
  invoke<T extends functions.GenericFunction<ReturnType<T>, any>>(
    fn: T,
  ): ReturnType<T> {
    return invoke(this, fn);
  }

  /**
   * Create a child scope that shares the registry but maintains its own scoped service instances.
   *
   * @returns A new child scope
   */
  createScope(): ServiceScope<K, V> {
    return new Scope<K, V>(this.registry, this.rootScope);
  }

  /**
   * Clear the cache for a specific service token.
   * This forces the service to be re-created on next access.
   *
   * @param token The service token to clear from cache
   * @returns True if the service was cached and removed, false otherwise
   */
  clearCache(token: K): boolean {
    return this.items.delete(token);
  }

  /**
   * Clear all cached services in this scope.
   * This forces all scoped services to be re-created on next access.
   * Does not affect the root scope cache for lazy services.
   */
  clearAllCache(): void {
    this.items.clear();
  }

  /**
   * Get the current cache size (number of cached service instances).
   *
   * @returns Number of cached services in this scope
   */
  getCacheSize(): number {
    return this.items.size;
  }

  /**
   * Check if a service is currently cached in this scope.
   *
   * @param token The service token to check
   * @returns True if the service is cached, false otherwise
   */
  isCached(token: K): boolean {
    return this.items.has(token);
  }
}

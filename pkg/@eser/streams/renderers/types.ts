// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { Span } from "../span.ts";

/**
 * A Renderer serializes a Span tree into a target format.
 *
 * The generic parameter `T` determines the output type:
 * - Built-in renderers (`ansi`, `markdown`, `plain`) return `string`
 * - External renderers can return any type (e.g., React.ReactElement)
 *
 * Built-in renderers: `@eser/streams/renderers`
 * External renderers: implement this interface in your own package.
 * Example: `@eser/laroux-react` provides `Renderer<React.ReactElement>`
 *
 * @template T - Output type (default: string)
 */
type Renderer<T = string> = {
  readonly name: string;
  readonly render: (spans: readonly Span[]) => T;
};

export type { Renderer };

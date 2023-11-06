// Copyright 2023 the cool authors. All rights reserved. MIT license.

export interface SignalLike<T> {
  value: T;
  peek(): T;
  subscribe(fn: (value: T) => void): () => void;
}

declare global {
  namespace JSX {
    interface HTMLAttributes {
      /**
       * Alternative url to fetch partials from on `<a>` or `<form>` tags
       */
      "f-partial"?: string | SignalLike<string>;
      /**
       * Enable or disable client side navigation and partials for this
       * particular node and its children.
       */
      "f-client-nav"?: boolean | SignalLike<boolean>;
    }
  }
}

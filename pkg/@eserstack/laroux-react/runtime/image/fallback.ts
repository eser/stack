// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Image fallbacks in the browser.
 *
 * laroux serializes what a server component renders as JSON, so an `onError`
 * function on an `<img>` never reaches the browser. `Image` writes its fallback
 * source to the {@link FALLBACK_ATTRIBUTE} attribute instead, and the laroux
 * client bootstrap calls {@link installImageFallbacks} once. From then on an
 * image with the attribute that fails to load switches to its fallback,
 * including one that failed before the bootstrap ran.
 *
 * @module
 */

/** The attribute that carries an image's fallback source into the page. */
export const FALLBACK_ATTRIBUTE = "data-laroux-fallback";

/** The part of a `<source>` element that applying a fallback changes. */
export type FallbackSourceElement = {
  removeAttribute(name: string): void;
};

/** The parts of an `<img>` element that applying a fallback reads and changes. */
export type FallbackImageElement = {
  readonly tagName: string;
  readonly complete: boolean;
  readonly naturalWidth: number;
  readonly parentElement: {
    readonly tagName: string;
    querySelectorAll(selectors: "source"): Iterable<FallbackSourceElement>;
  } | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  decode(): Promise<void>;
};

/** A load error event; only its target is read. */
export type FallbackErrorEvent = {
  readonly target: unknown;
};

/** The parts of a document that installing the fallbacks uses. */
export type FallbackDocument = {
  addEventListener(
    type: "error",
    listener: (event: FallbackErrorEvent) => void,
    useCapture: boolean,
  ): void;
  removeEventListener(
    type: "error",
    listener: (event: FallbackErrorEvent) => void,
    useCapture: boolean,
  ): void;
  querySelectorAll(selectors: string): Iterable<unknown>;
};

const isFallbackImage = (value: unknown): value is FallbackImageElement =>
  typeof value === "object" &&
  value !== null &&
  "tagName" in value &&
  value.tagName === "IMG";

/**
 * Switch a failed image to the source in its {@link FALLBACK_ATTRIBUTE}.
 *
 * Does nothing when the image has no fallback or already shows it, so a
 * fallback that fails too does not start a loop. Inside a `<picture>`, the
 * `<source>` elements lose their `srcset` so the browser picks the image's own
 * `src` again.
 *
 * @param image - The `<img>` element that failed to load
 * @returns Whether the fallback was applied
 */
export function applyImageFallback(image: FallbackImageElement): boolean {
  const fallback = image.getAttribute(FALLBACK_ATTRIBUTE);

  if (
    fallback === null ||
    fallback === "" ||
    image.getAttribute("src") === fallback
  ) {
    return false;
  }

  const parent = image.parentElement;
  if (parent !== null && parent.tagName === "PICTURE") {
    for (const source of parent.querySelectorAll("source")) {
      source.removeAttribute("srcset");
    }
  }

  image.removeAttribute("srcset");
  image.setAttribute("src", fallback);

  return true;
}

/**
 * Apply image fallbacks for the rest of the page's life.
 *
 * Load errors do not bubble, so one listener in the capture phase sees every
 * image on the page, including images React renders later. Images that failed
 * before this call fired their error event already, so they are checked once
 * here.
 *
 * @param document - The page document
 * @returns A function that removes the listener
 */
export function installImageFallbacks(document: FallbackDocument): () => void {
  const onError = (event: FallbackErrorEvent) => {
    if (isFallbackImage(event.target)) {
      applyImageFallback(event.target);
    }
  };

  document.addEventListener("error", onError, true);

  for (const candidate of document.querySelectorAll(
    `img[${FALLBACK_ATTRIBUTE}]`,
  )) {
    if (
      isFallbackImage(candidate) &&
      candidate.complete &&
      candidate.naturalWidth === 0
    ) {
      // A loaded SVG without its own size reports a zero width too; only a
      // failed decode shows that the image is broken. Both outcomes are
      // handled here, so the promise is not awaited.
      candidate.decode().then(
        () => {},
        () => {
          applyImageFallback(candidate);
        },
      );
    }
  }

  return () => {
    document.removeEventListener("error", onError, true);
  };
}

// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { view } from "./drivers/view.tsx";

export const SELF = "'self'";
export const UNSAFE_INLINE = "'unsafe-inline'";
export const UNSAFE_EVAL = "'unsafe-eval'";
export const UNSAFE_HASHES = "'unsafe-hashes'";
export const NONE = "'none'";
export const STRICT_DYNAMIC = "'strict-dynamic'";

export function nonce(val: string) {
  return `'nonce-${val}'`;
}

export interface ContentSecurityPolicy {
  directives: ContentSecurityPolicyDirectives;
  reportOnly: boolean;
}

export interface ContentSecurityPolicyDirectives {
  // Fetch directives
  /**
   * Defines the valid sources for web workers and nested browsing contexts
   * loaded using elements such as <frame> and <iframe>.
   */
  childSrc?: Array<string>;
  /**
   * Restricts the URLs which can be loaded using script interfaces.
   */
  connectSrc?: Array<string>;
  /**
   * Serves as a fallback for the other fetch directives.
   */
  defaultSrc?: Array<string>;
  /**
   * Specifies valid sources for fonts loaded using @font-face.
   */
  fontSrc?: Array<string>;
  /**
   * Specifies valid sources for nested browsing contexts loading using elements
   * such as <frame> and <iframe>.
   */
  frameSrc?: Array<string>;
  /**
   * Specifies valid sources of images and favicons.
   */
  imgSrc?: Array<string>;
  /**
   * Specifies valid sources of application manifest files.
   */
  manifestSrc?: Array<string>;
  /**
   * Specifies valid sources for loading media using the <audio> , <video> and
   * <track> elements.
   */
  mediaSrc?: Array<string>;
  /**
   * Specifies valid sources for the <object>, <embed>, and <applet> elements.
   */
  objectSrc?: Array<string>;
  /**
   * Specifies valid sources to be prefetched or prerendered.
   */
  prefetchSrc?: Array<string>;
  /**
   * Specifies valid sources for JavaScript.
   */
  scriptSrc?: Array<string>;
  /**
   * Specifies valid sources for JavaScript <script> elements.
   */
  scriptSrcElem?: Array<string>;
  /**
   * Specifies valid sources for JavaScript inline event handlers.
   */
  scriptSrcAttr?: Array<string>;
  /**
   * Specifies valid sources for stylesheets.
   */
  styleSrc?: Array<string>;
  /**
   * Specifies valid sources for stylesheets <style> elements and <link>
   * elements with rel="stylesheet".
   */
  styleSrcElem?: Array<string>;
  /**
   * Specifies valid sources for inline styles applied to individual DOM
   * elements.
   */
  styleSrcAttr?: Array<string>;
  /**
   * Specifies valid sources for Worker, SharedWorker, or ServiceWorker scripts.
   */
  workerSrc?: Array<string>;

  // Document directives
  /**
   * Restricts the URLs which can be used in a document's <base> element.
   */
  baseUri?: Array<string>;
  /**
   * Enables a sandbox for the requested resource similar to the <iframe>
   * sandbox attribute.
   */
  sandbox?: Array<string>;

  // Navigation directives
  /**
   * Restricts the URLs which can be used as the target of a form submissions
   * from a given context.
   */
  formAction?: Array<string>;
  /**
   * Specifies valid parents that may embed a page using <frame>, <iframe>,
   * <object>, <embed>, or <applet>.
   */
  frameAncestors?: Array<string>;
  /**
   * Restricts the URLs to which a document can initiate navigation by any
   * means, including <form> (if form-action is not specified), <a>,
   * window.location, window.open, etc.
   */
  navigateTo?: Array<string>;

  /**
   * The URI to report CSP violations to.
   */
  reportUri?: string;
}

export const CSP_CONTEXT = view.adapter.createContext<
  ContentSecurityPolicy | undefined
>(
  undefined,
);

export function useCSP(mutator: (csp: ContentSecurityPolicy) => void) {
  const csp = view.adapter.useContext(CSP_CONTEXT);

  if (csp !== undefined) {
    mutator(csp);
  }
}

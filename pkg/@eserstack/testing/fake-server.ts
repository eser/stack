// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Handler function type for processing HTTP requests.
 */
export type Handler = (req: Request) => Response | Promise<Response>;

/**
 * Configuration options for FakeServer.
 */
export interface FakeServerOptions {
  /**
   * Base URL for requests. Defaults to "http://localhost".
   */
  baseUrl?: string;
}

/**
 * A mock HTTP server for testing request handlers without actual network operations.
 *
 * @example
 * ```typescript
 * const server = new FakeServer((req) => {
 *   if (req.url.endsWith("/api/users")) {
 *     return Response.json([{ id: 1, name: "Test" }]);
 *   }
 *   return new Response("Not Found", { status: 404 });
 * });
 *
 * const response = await server.get("/api/users");
 * const users = await response.json();
 * ```
 */
export class FakeServer {
  private handler: Handler;
  private baseUrl: string;

  /**
   * Creates a new FakeServer instance.
   *
   * @param handler - The request handler function
   * @param options - Optional configuration
   */
  constructor(handler: Handler, options?: FakeServerOptions) {
    this.handler = handler;
    this.baseUrl = options?.baseUrl ?? "http://localhost";
  }

  /**
   * Makes a request to the handler with the specified input and options.
   *
   * @param input - The URL or Request object
   * @param init - Optional request configuration
   * @returns The response from the handler
   */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url: string;

    if (typeof input === "string") {
      url = input.startsWith("http") ? input : `${this.baseUrl}${input}`;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      url = input.url;
    }

    const req = new Request(url, init);
    return await this.handler(req);
  }

  /**
   * Makes a GET request.
   *
   * @param path - The path to request
   * @param headers - Optional headers
   * @returns The response
   */
  get = (path: string, headers?: HeadersInit): Promise<Response> =>
    this.fetch(path, { method: "GET", headers });

  /**
   * Makes a POST request.
   *
   * @param path - The path to request
   * @param body - Optional request body
   * @param headers - Optional headers
   * @returns The response
   */
  post = (
    path: string,
    body?: BodyInit,
    headers?: HeadersInit,
  ): Promise<Response> => this.fetch(path, { method: "POST", body, headers });

  /**
   * Makes a PUT request.
   *
   * @param path - The path to request
   * @param body - Optional request body
   * @param headers - Optional headers
   * @returns The response
   */
  put = (
    path: string,
    body?: BodyInit,
    headers?: HeadersInit,
  ): Promise<Response> => this.fetch(path, { method: "PUT", body, headers });

  /**
   * Makes a PATCH request.
   *
   * @param path - The path to request
   * @param body - Optional request body
   * @param headers - Optional headers
   * @returns The response
   */
  patch = (
    path: string,
    body?: BodyInit,
    headers?: HeadersInit,
  ): Promise<Response> => this.fetch(path, { method: "PATCH", body, headers });

  /**
   * Makes a DELETE request.
   *
   * @param path - The path to request
   * @param headers - Optional headers
   * @returns The response
   */
  delete = (path: string, headers?: HeadersInit): Promise<Response> =>
    this.fetch(path, { method: "DELETE", headers });

  /**
   * Makes a HEAD request.
   *
   * @param path - The path to request
   * @param headers - Optional headers
   * @returns The response
   */
  head = (path: string, headers?: HeadersInit): Promise<Response> =>
    this.fetch(path, { method: "HEAD", headers });

  /**
   * Makes an OPTIONS request.
   *
   * @param path - The path to request
   * @param headers - Optional headers
   * @returns The response
   */
  options = (path: string, headers?: HeadersInit): Promise<Response> =>
    this.fetch(path, { method: "OPTIONS", headers });
}

/**
 * Creates a FakeServer for testing middleware functions.
 *
 * @param middleware - The middleware function to test
 * @param options - Optional server configuration
 * @returns A FakeServer instance
 */
export const serveMiddleware = (
  middleware: Handler,
  options?: FakeServerOptions,
): FakeServer => {
  return new FakeServer(middleware, options);
};

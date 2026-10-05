// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Error Boundary Component
 * Catches errors in RSC rendering and provides a friendly UI
 */

import * as React from "react";
import * as logging from "@eserstack/logging";

/** Props of {@link ErrorBoundary}. */
export type ErrorBoundaryProps = {
  /** The tree whose render errors the boundary catches */
  children: React.ReactNode;
};

/** State of {@link ErrorBoundary}. */
export type ErrorBoundaryState = {
  /** Whether a render below the boundary failed */
  hasError: boolean;
  /** The error that failed the render, or null */
  error: Error | null;
  /** React's component stack for the error, or null */
  errorInfo: React.ErrorInfo | null;
};

// Extended error interface matching LarouxError
interface LarouxError extends Error {
  code?: string;
  hint?: string;
  docUrl?: string;
}

// Optional fields of a LarouxError render only when they hold text.
const hasText = (value: string | undefined): value is string =>
  value !== undefined && value !== "";

// Check if debug mode is enabled
const isDebugMode = () => {
  if (typeof globalThis === "undefined") return false;
  return (
    new URLSearchParams(globalThis.location.search).get("debug") === "1"
  );
};

// Check if the error is a network-related error that should be handled silently
// These errors occur during Lighthouse testing with network throttling
const isNetworkError = (error: Error | null): boolean => {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("network error") ||
    message.includes("failed to fetch") ||
    message.includes("load failed") ||
    message.includes("networkerror") ||
    error.name === "TypeError" && message.includes("network")
  );
};

/**
 * Catches errors in the rendering below it. A network error keeps the
 * server-rendered content and shows nothing; any other error shows an error
 * view with a retry button, and its details with `?debug=1` in the URL.
 */
export class ErrorBoundary
  extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  /**
   * Creates the boundary with no error recorded.
   *
   * @param props - The tree to guard
   */
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  /** Records the error so the next render shows the error view. */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  /** Logs the error once and keeps its component stack for the view. */
  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // The boundary handles the error, so this is the one place that logs it.
    const logger = logging.logger.getLogger([
      "laroux-bundler",
      "error-boundary",
    ]);
    if (isNetworkError(error)) {
      logger.with({ error }).warn(
        "render hit a network error; keeping the server-rendered content",
      );
    } else {
      logger.with({
        error,
        componentStack: errorInfo.componentStack,
      }).error("render failed; showing the error view");
    }

    this.setState({
      errorInfo,
    });
  }

  /** Reloads the page, which renders it again from the server. */
  handleRetry = (): void => {
    // Reload the page to retry
    globalThis.location.reload();
  };

  /** Renders the children, or the error view after an error. */
  override render(): React.ReactNode {
    if (this.state.hasError) {
      // For network errors, don't show visible error UI - just return null
      // This keeps SSR content visible and prevents Lighthouse score penalty
      // The error is already logged in componentDidCatch
      if (isNetworkError(this.state.error)) {
        return null;
      }

      const debugMode = isDebugMode();
      const error = this.state.error as LarouxError;
      const _hasExtendedInfo = error?.code ?? error?.hint ?? error?.docUrl;

      return (
        <div
          style={{
            padding: "2rem",
            maxWidth: "800px",
            margin: "2rem auto",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          <div
            style={{
              background: "#fee2e2",
              border: "2px solid #dc2626",
              borderRadius: "8px",
              padding: "1.5rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "1rem",
              }}
            >
              <h2
                style={{
                  color: "#991b1b",
                  marginTop: 0,
                  marginBottom: 0,
                  fontSize: "1.5rem",
                }}
              >
                ❌ {error?.name ?? "Error"}
              </h2>
              {hasText(error?.code)
                ? (
                  <span
                    style={{
                      background: "#7f1d1d",
                      color: "#fee2e2",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "4px",
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      fontFamily: "monospace",
                    }}
                  >
                    {error.code}
                  </span>
                )
                : null}
            </div>

            <p
              style={{
                color: "#7f1d1d",
                fontSize: "1rem",
                lineHeight: "1.6",
                marginTop: "1rem",
              }}
            >
              {error?.message ??
                "The React Server Components renderer encountered an error while loading the page."}
            </p>

            {hasText(error?.hint)
              ? (
                <div
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    padding: "1rem",
                    marginTop: "1rem",
                  }}
                >
                  <div
                    style={{
                      color: "#991b1b",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                      fontSize: "0.875rem",
                    }}
                  >
                    💡 Hint:
                  </div>
                  <div
                    style={{
                      color: "#7f1d1d",
                      fontSize: "0.875rem",
                      lineHeight: "1.5",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {error.hint}
                  </div>
                </div>
              )
              : null}

            {hasText(error?.docUrl)
              ? (
                <div style={{ marginTop: "1rem" }}>
                  <a
                    href={error.docUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      background: "#dbeafe",
                      color: "#1e40af",
                      textDecoration: "none",
                      padding: "0.5rem 1rem",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      fontWeight: "600",
                      border: "1px solid #93c5fd",
                    }}
                  >
                    📖 View Documentation
                  </a>
                </div>
              )
              : null}

            <div style={{ marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={this.handleRetry}
                style={{
                  background: "#dc2626",
                  color: "white",
                  border: "none",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "6px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  marginRight: "1rem",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#b91c1c";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#dc2626";
                }}
              >
                🔄 Reload Page
              </button>

              <button
                type="button"
                onClick={() => {
                  this.setState({
                    hasError: false,
                    error: null,
                    errorInfo: null,
                  });
                }}
                style={{
                  background: "white",
                  color: "#dc2626",
                  border: "2px solid #dc2626",
                  padding: "0.75rem 1.5rem",
                  borderRadius: "6px",
                  fontSize: "1rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#fef2f2";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "white";
                }}
              >
                Try Again
              </button>
            </div>

            {debugMode && this.state.error && (
              <details
                style={{
                  marginTop: "1.5rem",
                  background: "#7f1d1d",
                  color: "#fee2e2",
                  padding: "1rem",
                  borderRadius: "6px",
                  fontSize: "0.875rem",
                  fontFamily: "monospace",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    fontWeight: "600",
                    marginBottom: "0.5rem",
                  }}
                >
                  🔍 Technical Details (Debug Mode)
                </summary>

                <div style={{ marginTop: "1rem" }}>
                  <div style={{ marginBottom: "0.75rem" }}>
                    <strong>Error:</strong> {this.state.error.message}
                  </div>

                  {hasText(this.state.error.stack)
                    ? (
                      <div>
                        <strong>Stack Trace:</strong>
                        <pre
                          style={{
                            overflow: "auto",
                            padding: "0.5rem",
                            background: "rgba(0, 0, 0, 0.3)",
                            borderRadius: "4px",
                            marginTop: "0.5rem",
                            fontSize: "0.75rem",
                            lineHeight: "1.4",
                          }}
                        >
                        {this.state.error.stack}
                        </pre>
                      </div>
                    )
                    : null}

                  {this.state.errorInfo && (
                    <div style={{ marginTop: "1rem" }}>
                      <strong>Component Stack:</strong>
                      <pre
                        style={{
                          overflow: "auto",
                          padding: "0.5rem",
                          background: "rgba(0, 0, 0, 0.3)",
                          borderRadius: "4px",
                          marginTop: "0.5rem",
                          fontSize: "0.75rem",
                          lineHeight: "1.4",
                        }}
                      >
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

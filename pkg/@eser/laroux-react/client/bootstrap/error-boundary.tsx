// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Error Boundary Component
 * Catches errors in RSC rendering and provides a friendly UI
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// Extended error interface matching LarouxError
interface LarouxError extends Error {
  code?: string;
  hint?: string;
  docUrl?: string;
}

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

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({
      errorInfo,
    });
  }

  handleRetry = (): void => {
    // Reload the page to retry
    globalThis.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      // For network errors, don't show visible error UI - just return null
      // This keeps SSR content visible and prevents Lighthouse score penalty
      // The error is already logged in componentDidCatch
      if (isNetworkError(this.state.error)) {
        console.warn(
          "[ErrorBoundary] Network error detected, keeping SSR content visible:",
          this.state.error?.message,
        );
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
              {error?.code && (
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
              )}
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

            {error?.hint && (
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
            )}

            {error?.docUrl && (
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
            )}

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

                  {this.state.error.stack && (
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
                  )}

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

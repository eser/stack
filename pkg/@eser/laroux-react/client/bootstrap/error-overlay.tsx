// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Error Overlay Component
 * Displays build and runtime errors in development mode
 */

"use client";

import { useEffect, useState } from "react";

interface ErrorInfo {
  message: string;
  stack?: string;
  file?: string;
  line?: number;
  column?: number;
}

export function ErrorOverlay() {
  const [error, setError] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    // Listen for runtime errors
    const handleError = (event: ErrorEvent) => {
      event.preventDefault();
      setError({
        message: event.message,
        stack: event.error?.stack,
        file: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };

    // Listen for unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      const error = event.reason;
      setError({
        message: error?.message ?? String(error),
        stack: error?.stack,
      });
    };

    // Listen for HMR error messages
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "error") {
        setError({
          message: event.data.message,
          stack: event.data.stack,
          file: event.data.file,
          line: event.data.line,
        });
      } else if (event.data?.type === "dismiss-error") {
        setError(null);
      }
    };

    globalThis.addEventListener("error", handleError);
    globalThis.addEventListener("unhandledrejection", handleRejection);
    globalThis.addEventListener("message", handleMessage);

    return () => {
      globalThis.removeEventListener("error", handleError);
      globalThis.removeEventListener("unhandledrejection", handleRejection);
      globalThis.removeEventListener("message", handleMessage);
    };
  }, []);

  if (!error) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        color: "#fff",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        fontSize: "14px",
        overflow: "auto",
        padding: "20px",
      }}
      onClick={() => setError(null)}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "20px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "24px",
                fontWeight: "bold",
                color: "#ff6b6b",
                marginBottom: "8px",
              }}
            >
              ⚠ Error
            </div>
            <div style={{ color: "#999", fontSize: "12px" }}>
              Click anywhere to dismiss, or fix the error
            </div>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              background: "transparent",
              border: "1px solid #555",
              color: "#fff",
              padding: "8px 16px",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Dismiss
          </button>
        </div>

        {/* Error Message */}
        <div
          style={{
            backgroundColor: "#1a1a1a",
            border: "1px solid #ff6b6b",
            borderRadius: "8px",
            padding: "20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              fontSize: "16px",
              fontWeight: "500",
              marginBottom: "12px",
              color: "#ff6b6b",
            }}
          >
            {error.message}
          </div>

          {error.file && (
            <div
              style={{
                fontSize: "12px",
                color: "#999",
                marginBottom: "8px",
              }}
            >
              at {error.file}
              {error.line && `:${error.line}`}
              {error.column && `:${error.column}`}
            </div>
          )}
        </div>

        {/* Stack Trace */}
        {error.stack && (
          <div>
            <div
              style={{
                fontSize: "14px",
                fontWeight: "500",
                marginBottom: "12px",
                color: "#999",
              }}
            >
              Stack Trace
            </div>
            <pre
              style={{
                backgroundColor: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: "8px",
                padding: "20px",
                overflow: "auto",
                margin: 0,
                fontSize: "12px",
                lineHeight: "1.5",
                color: "#ccc",
              }}
            >
              {error.stack}
            </pre>
          </div>
        )}

        {/* Help Text */}
        <div
          style={{
            marginTop: "20px",
            padding: "16px",
            backgroundColor: "#1a2332",
            border: "1px solid #2d3748",
            borderRadius: "8px",
            fontSize: "13px",
            color: "#a0aec0",
          }}
        >
          <div style={{ fontWeight: "500", marginBottom: "8px" }}>
            💡 Tip
          </div>
          <div>
            This error occurred during development. Fix the error in your code
            and the app will automatically reload.
          </div>
        </div>
      </div>
    </div>
  );
}

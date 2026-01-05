"use client";

import type * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  state?: "default" | "error" | "success";
};

export function Input({
  className = "",
  state = "default",
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      data-state={state}
      className={`form-input ${className}`}
      {...props}
    />
  );
}

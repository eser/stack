"use client";

import type * as React from "react";

export type TextareaProps =
  & React.TextareaHTMLAttributes<HTMLTextAreaElement>
  & {
    state?: "default" | "error" | "success";
  };

export function Textarea({
  className = "",
  state = "default",
  ...props
}: TextareaProps) {
  return (
    <textarea
      data-state={state}
      className={`form-textarea ${className}`}
      {...props}
    />
  );
}

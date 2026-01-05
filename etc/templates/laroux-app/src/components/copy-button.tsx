"use client";

/**
 * Copy Button Component
 * Client component for copying code to clipboard with visual feedback
 */

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

export type CopyButtonProps = {
  code: string;
  className?: string;
};

export function CopyButton({ code, className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`copy-button ${className}`}
      title={copied ? "Copied!" : "Copy to clipboard"}
      aria-label={copied ? "Copied" : "Copy to clipboard"}
    >
      {copied
        ? <Check className="w-4 h-4" strokeWidth={2} />
        : <Clipboard className="w-4 h-4" strokeWidth={2} />}
      {copied && <span className="copy-feedback">Copied!</span>}
    </button>
  );
}

/**
 * Code Block Component
 * Server-rendered syntax highlighting using Shiki with GitHub theme
 * Zero client-side JavaScript for highlighting
 */

import { codeToHtml } from "shiki";
import { CopyButton } from "../components/copy-button.tsx";

export type CodeBlockProps = {
  code: string;
  language: string;
  showCopy?: boolean;
  showLanguage?: boolean;
  className?: string;
};

// Language display names
const languageNames: Record<string, string> = {
  tsx: "TypeScript",
  jsx: "JavaScript",
  typescript: "TypeScript",
  javascript: "JavaScript",
  css: "CSS",
  html: "HTML",
  shell: "Shell",
  bash: "Bash",
  json: "JSON",
  json5: "JSON5",
  svg: "SVG",
};

export async function CodeBlock({
  code,
  language,
  showCopy = true,
  showLanguage = true,
  className = "",
}: CodeBlockProps) {
  const displayLanguage = languageNames[language] ?? language.toUpperCase();

  // Generate syntax-highlighted HTML using Shiki
  const html = await codeToHtml(code, {
    lang: language,
    theme: "github-light",
  });

  return (
    <div className={`code-block-wrapper ${className}`}>
      {/* Header with language badge and copy button */}
      <div className="code-block-header">
        {showLanguage && (
          <span className="language-badge">{displayLanguage}</span>
        )}
        {showCopy && <CopyButton code={code} />}
      </div>

      {/* Shiki rendered code */}
      <div
        className="code-block-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

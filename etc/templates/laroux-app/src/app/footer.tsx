import { ExternalLink } from "lucide-react";

export function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-center gap-6 p-8 text-sm border-t border-neutral-200 bg-surface min-h-[5.5rem]">
      <a
        key="top"
        href="#top"
        className="flex items-center gap-2 text-neutral-600 hover:text-primary-600 hover:underline underline-offset-4 transition-colors"
      >
        <img
          aria-hidden
          src="/assets/window.svg"
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 opacity-70"
        />
        Back to top
      </a>

      <a
        key="source"
        className="flex items-center gap-2 text-neutral-600 hover:text-primary-600 hover:underline underline-offset-4 transition-colors"
        href="https://github.com/eser/stack"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          aria-hidden
          src="/assets/globe.svg"
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 opacity-70"
        />
        View Source
        <ExternalLink className="w-3 h-3 opacity-60" strokeWidth={2} />
      </a>
      <a
        key="laroux"
        className="flex items-center gap-2 text-neutral-600 hover:text-primary-600 hover:underline underline-offset-4 transition-colors"
        href="https://laroux.now"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          aria-hidden
          src="/assets/globe.svg"
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 opacity-70"
        />
        Go to laroux.now
        <ExternalLink className="w-3 h-3 opacity-60" strokeWidth={2} />
      </a>
    </footer>
  );
}

import type { ReactNode } from "react";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div id="root" className="min-h-screen">
      {children}
    </div>
  );
}

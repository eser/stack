/**
 * Layout - Root Layout Component
 * Wraps page content with shared UI (Sidebar, Footer)
 */

import type { ReactNode } from "react";
import { Sidebar } from "./sidebar.tsx";
import { Footer } from "./footer.tsx";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div
      id="top"
      className="flex flex-col lg:flex-row min-h-screen bg-neutral-50"
    >
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <main className="flex-1">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-20">
            {children}
          </div>
        </main>

        <Footer />
      </div>
    </div>
  );
}

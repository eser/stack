/**
 * Styling Demo Component (Server)
 * Demonstrates the styling capabilities of laroux.js:
 * - CSS Modules with scoped class names
 * - Tailwind utility classes
 * - CSS Nesting syntax
 * - Tree-shaking and optimization
 */

import { CodeBlock } from "./code-block.tsx";
import styles from "./styling-demo.module.css";

export function StylingDemo() {
  return (
    <div className="space-y-6">
      {/* CSS Modules Example */}
      <section
        key="css-modules"
        className="bg-surface rounded-lg border border-neutral-200 px-5 py-4 shadow-sm"
      >
        <h3 className="text-xl font-semibold mb-3 text-neutral-800">
          CSS Modules
        </h3>
        <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
          CSS Modules provide{" "}
          <span className="bg-linear-to-r from-accent-100 to-primary-100 px-1.5 py-0.5 rounded font-medium">
            scoped class names
          </span>{" "}
          that prevent global namespace conflicts. Each class name is
          automatically hashed and isolated to this component.
        </p>

        <div className={styles.exampleBox}>
          <div className={styles.boxTitle}>
            Scoped Styles Example
          </div>
          <div className={styles.boxContent}>
            This box uses CSS module classes. Try hovering to see the
            interaction! All styles are scoped to this component and won't
            conflict with other components using similar class names.
          </div>
        </div>

        <CodeBlock
          language="tsx"
          code={`// Import CSS module
import styles from "./styling-demo.module.css";

// Use scoped class names
<div className={styles.exampleBox}>
  <div className={styles.boxTitle}>
    Scoped Styles Example
  </div>
  <div className={styles.boxContent}>
    This box uses CSS module classes.
  </div>
</div>`}
        />
      </section>

      {/* Tailwind Support Example */}
      <section
        key="tailwind"
        className="bg-surface rounded-lg border border-neutral-200 px-5 py-4 shadow-sm"
      >
        <h3 className="text-xl font-semibold mb-3 text-neutral-800">
          Tailwind 4.x
        </h3>
        <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
          Tailwind CSS utilities can be used alongside CSS modules. Only used
          utilities are included in the final bundle thanks to automatic{" "}
          <span className="bg-linear-to-r from-accent-100 to-primary-100 px-1.5 py-0.5 rounded font-medium">
            tree-shaking
          </span>
          .
        </p>

        {/* Combining CSS modules with Tailwind */}
        <div className="flex gap-4 flex-wrap">
          <div
            key="primary"
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Tailwind Primary
          </div>
          <div
            key="accent"
            className="px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
          >
            Tailwind Accent
          </div>
          <div
            key="success"
            className="px-4 py-2 bg-success-700 text-white rounded-lg hover:bg-success-800 transition-colors"
          >
            Tailwind Success
          </div>
        </div>

        <div className="mt-4">
          <CodeBlock
            language="tsx"
            code={`<!-- Tailwind 4.x classes -->
<div className="flex gap-4 flex-wrap">
  <div className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
    Tailwind Primary
  </div>
  <div className="px-4 py-2 bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors">
    Tailwind Accent
  </div>
  <div className="px-4 py-2 bg-success-700 text-white rounded-lg hover:bg-success-800 transition-colors">
    Tailwind Success
  </div>
</div>`}
          />
        </div>
      </section>

      {/* CSS Nesting Example */}
      <section
        key="nesting"
        className="bg-surface rounded-lg border border-neutral-200 px-5 py-4 shadow-sm"
      >
        <h3 className="text-xl font-semibold mb-3 text-neutral-800">
          CSS Nesting
        </h3>
        <p className="text-sm text-neutral-600 mb-4 leading-relaxed">
          Native CSS nesting is supported. No additional preprocessor or plugin
          needed! Use the <code>&</code> parent selector for{" "}
          <span className="bg-linear-to-r from-accent-100 to-primary-100 px-1.5 py-0.5 rounded font-medium">
            cleaner, more maintainable
          </span>{" "}
          styles.
        </p>

        <div className="border-2 border-dashed border-accent-300 p-4 rounded-lg">
          <div className="ml-4 p-2 bg-accent-50 rounded">
            Level 1 - Parent
            <div className="ml-4 p-2 bg-accent-100 rounded mt-2">
              Level 2 - Nested child
              <div className="ml-4 p-2 bg-accent-200 text-accent-900 rounded mt-2">
                Level 3 - Deeply nested
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <CodeBlock
            language="css"
            code={`/* Native CSS nesting in .module.css */
.container {
  padding: 2rem;

  & .header {
    font-size: 1.75rem;

    & .badge {
      margin-left: 0.5rem;
    }
  }

  &:hover {
    transform: translateY(-2px);
  }
}`}
          />
        </div>
      </section>
    </div>
  );
}

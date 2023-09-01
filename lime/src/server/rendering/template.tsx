import { RenderState } from "./state.ts";
import { setRenderState } from "./preact_hooks.ts";
import { view } from "../../runtime/drivers/view.ts";
import { HEAD_CONTEXT } from "../../runtime/head.ts";
import { CSP_CONTEXT } from "../../runtime/csp.ts";

export function renderHtml(state: RenderState) {
  setRenderState(state);
  state.renderingUserTemplate = true;
  state.headChildren = false;

  const componentStack = state.componentStack;
  try {
    const routeComponent = componentStack[componentStack.length - 1];
    let finalComp = view.h(routeComponent, state.routeOptions);

    // Skip page component
    let i = componentStack.length - 1;
    while (i--) {
      const component = componentStack[i];
      const curComp = finalComp;

      finalComp = view.h(component, {
        ...state.routeOptions,
        Component() {
          return curComp;
        },
      });
    }

    const app = view.h(
      CSP_CONTEXT.Provider,
      // deno-lint-ignore no-explicit-any
      { value: state.csp } as any,
      view.h(HEAD_CONTEXT.Provider, {
        value: state.headVNodes,
        children: finalComp,
      }),
    );

    let html = view.renderToString(app);

    for (const [id, children] of state.slots.entries()) {
      const slotHtml = view.renderToString(
        view.h(view.Fragment, null, children),
      );
      const templateId = id.replace(/:/g, "-");
      html += `<template id="${templateId}">${slotHtml}</template>`;
    }

    return html;
  } finally {
    setRenderState(null);
  }
}

export function renderOuterDocument(
  state: RenderState,
  opts: {
    bodyHtml: string;
    lang?: string;
    preloads: string[];
    moduleScripts: [src: string, nonce: string][];
  },
) {
  const {
    docHtml,
    docHead,
    renderedHtmlTag,
    docTitle,
    docBody,
    docHeadNodes,
    headVNodes,
  } = state;

  const page = view.h(
    "html",
    docHtml ?? { lang: opts.lang },
    view.h(
      "head",
      docHead,
      !renderedHtmlTag ? view.h("meta", { charSet: "utf-8" }) : null,
      !renderedHtmlTag
        ? (view.h("meta", {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0",
        }))
        : null,
      docTitle,
      docHeadNodes.map((node) => view.h(node.type, node.props)),
      opts.preloads.map((src) =>
        view.h("link", { rel: "modulepreload", href: src })
      ),
      opts.moduleScripts.map(([src, nonce]) =>
        view.h("script", { src: src, nonce, type: "module" })
      ),
      headVNodes,
    ),
    view.h("body", {
      ...docBody,
      dangerouslySetInnerHTML: { __html: opts.bodyHtml },
    }),
  );

  try {
    setRenderState(state);
    return "<!DOCTYPE html>" + view.renderToString(page);
  } finally {
    setRenderState(null);
  }
}

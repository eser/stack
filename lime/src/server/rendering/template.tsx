import { RenderState } from "./state.ts";
import { view } from "../../runtime/drivers/view.ts";
import { HEAD_CONTEXT } from "../../runtime/head.ts";
import { CSP_CONTEXT } from "../../runtime/csp.ts";

export function renderHtml(state: RenderState) {
  view.adapter.setRenderState(state);
  state.renderingUserTemplate = true;
  state.headChildren = false;

  const componentStack = state.componentStack;
  try {
    const routeComponent = componentStack[componentStack.length - 1];
    let finalComp = view.adapter.h(routeComponent, state.routeOptions);

    // Skip page component
    let i = componentStack.length - 1;
    while (i--) {
      const component = componentStack[i];
      const curComp = finalComp;

      finalComp = view.adapter.h(component, {
        ...state.routeOptions,
        Component() {
          return curComp;
        },
      });
    }

    const app = view.adapter.h(
      CSP_CONTEXT.Provider,
      // deno-lint-ignore no-explicit-any
      { value: state.csp } as any,
      view.adapter.h(HEAD_CONTEXT.Provider, {
        value: state.headVNodes,
        children: finalComp,
      }),
    );

    let html = view.adapter.renderToString(app);

    for (const [id, children] of state.slots.entries()) {
      const slotHtml = view.adapter.renderToString(
        view.adapter.h(view.adapter.Fragment, null, children),
      );
      const templateId = id.replace(/:/g, "-");
      html += `<template id="${templateId}">${slotHtml}</template>`;
    }

    return html;
  } finally {
    view.adapter.setRenderState(null);
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

  const page = view.adapter.h(
    "html",
    docHtml ?? { lang: opts.lang },
    view.adapter.h(
      "head",
      docHead,
      !renderedHtmlTag ? view.adapter.h("meta", { charSet: "utf-8" }) : null,
      !renderedHtmlTag
        ? (view.adapter.h("meta", {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0",
        }))
        : null,
      docTitle,
      docHeadNodes.map((node) => view.adapter.h(node.type, node.props)),
      opts.preloads.map((src) =>
        view.adapter.h("link", { rel: "modulepreload", href: src })
      ),
      opts.moduleScripts.map(([src, nonce]) =>
        view.adapter.h("script", { src: src, nonce, type: "module" })
      ),
      headVNodes,
    ),
    view.adapter.h("body", {
      ...docBody,
      dangerouslySetInnerHTML: { __html: opts.bodyHtml },
    }),
  );

  try {
    view.adapter.setRenderState(state);
    return "<!DOCTYPE html>" + view.adapter.renderToString(page);
  } finally {
    view.adapter.setRenderState(null);
  }
}

import { view } from "../runtime/drivers/view.tsx";
import { DEBUG } from "./constants.ts";
import { type ErrorPageProps } from "./types.ts";

export default function DefaultErrorPage(props: ErrorPageProps) {
  const { error } = props;

  let message = undefined;
  if (DEBUG) {
    if (error instanceof Error) {
      message = error.stack;
    } else {
      message = String(error);
    }
  }

  return view.adapter.h(
    "div",
    {
      class: "lime-error-page",
      style: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      },
    },
    view.adapter.h(
      "div",
      {
        style: {
          border: "#f3f4f6 2px solid",
          borderTop: "red 4px solid",
          background: "#f9fafb",
          margin: 16,
          minWidth: "300px",
        },
      },
      view.adapter.h("p", {
        style: {
          margin: 0,
          fontSize: "12pt",
          padding: 16,
          fontFamily: "sans-serif",
        },
      }, "An error occurred during route handling or page rendering."),
      message && view.adapter.h("pre", {
        style: {
          margin: 0,
          fontSize: "12pt",
          overflowY: "auto",
          padding: 16,
          paddingTop: 0,
          fontFamily: "monospace",
        },
      }, message),
    ),
  );
}

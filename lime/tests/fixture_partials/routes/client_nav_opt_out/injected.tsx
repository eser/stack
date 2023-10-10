import { defineRoute } from "../../../../server.ts";

export default defineRoute(() => {
  return new Response("", {
    status: 302,
    headers: {
      Location: "/client_nav_opt_out",
    },
  });
});

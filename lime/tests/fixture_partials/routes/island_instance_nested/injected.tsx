import { defineRoute } from "../../../../server.ts";

export default defineRoute(() => {
  return new Response("", {
    status: 302,
    headers: {
      Location: "/island_instance_nested",
    },
  });
});

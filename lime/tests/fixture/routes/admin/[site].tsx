import { type Handler, type PageProps } from "$cool/lime/server.ts";
import Greeter from "../../islands/Greeter.tsx";

export const handler: Handler = (_req, ctx) =>
  ctx.render({ site: ctx.params.site });

export default function Component(props: PageProps<{ site: string }>) {
  return <Greeter site={props.data?.site ?? "not working"} />;
}

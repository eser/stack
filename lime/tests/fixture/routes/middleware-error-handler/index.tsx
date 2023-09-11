import { type Handlers, type PageProps } from "$cool/lime/server.ts";

export const handler: Handlers = {
  GET(_req, ctx) {
    return ctx.render(ctx.state.flag);
  },
};

export default function Home(props: PageProps<boolean>) {
  if (props.data) {
    throw Error("i'm erroring on purpose");
  }
  return <div>this won't get shown</div>;
}
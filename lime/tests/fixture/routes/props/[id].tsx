import { type PageProps } from "../../../../server.ts";

export default function Home(props: PageProps) {
  return <div>{JSON.stringify(props)}</div>;
}

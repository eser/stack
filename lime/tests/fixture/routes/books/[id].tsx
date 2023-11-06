// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type PageProps, type RouteConfig } from "../../../../server.ts";

export default function Page(props: PageProps) {
  return <div>Book {props.params["id"]}</div>;
}

export const config: RouteConfig = {
  routeOverride: "/books/:id(\\d+)",
};

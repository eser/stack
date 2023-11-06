// Copyright 2023 the cool authors. All rights reserved. MIT license.

import { type ErrorPageProps } from "../../../server.ts";

export default function Error500Page({ error }: ErrorPageProps) {
  return <p>500 internal error: {(error as Error).message}</p>;
}

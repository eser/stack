// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export const resolvePath = (
  filepath: string,
  baseUrl: string | null = null,
): string => {
  if (baseUrl === null || filepath[0] === "/") {
    return filepath;
  }

  const base = baseUrl[0] === "/" ? `file://${baseUrl}/` : baseUrl;
  const url = new URL(filepath, base);

  if (url.protocol === "file:") {
    return url.href.substring(7);
  }

  return url.href;
};

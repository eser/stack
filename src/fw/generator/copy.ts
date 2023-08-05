import { path, streams } from "./deps.ts";

const tryParseUrl = (url: string): URL | undefined => {
  try {
    return new URL(url);
  } catch (err) {
    if (err instanceof TypeError) {
      return undefined;
    }

    throw err;
  }
};

export const copy = async (source: string, target: string) => {
  let sourceStream: Deno.Reader | undefined;

  const sourceUrl = tryParseUrl(source);
  const isLocalFile = (sourceUrl === undefined) ||
    (sourceUrl.protocol === "file:");

  if (isLocalFile) {
    sourceStream = await Deno.open(
      sourceUrl !== undefined ? path.posix.fromFileUrl(sourceUrl) : source,
    );
  } else {
    sourceStream = await fetch(sourceUrl)
      .then((response) => response.body)
      .then((body) => body?.getReader())
      .then((reader) =>
        (reader !== undefined)
          ? streams.readerFromStreamReader(reader)
          : undefined
      );
  }

  if (sourceStream === undefined) {
    throw new Error(
      `source stream reader is undefined for '${sourceUrl?.href ?? source}'`,
    );
  }

  const targetStream = await Deno.open(target, {
    create: true,
    write: true,
  });

  await streams.copy(sourceStream, targetStream);
};

export { copy as default };

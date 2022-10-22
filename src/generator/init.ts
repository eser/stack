import { flags, pathPosix } from "./deps.ts";
import { generate } from "./generate.ts";

const VERSION = "0.0.1";

const baseUrl = import.meta.url;
// const baseUrl = "https:/deno.land/x/hex/src/generator/init.ts";

const getRelativePath = () => {
  const url = new URL(baseUrl);

  if (url.protocol === "file:") {
    return pathPosix.relative(
      Deno.cwd(),
      pathPosix.fromFileUrl(url.href),
    );
  }

  return url.href;
};

const relativePath = getRelativePath();

const showHelp = () => {
  const messageContents = `hex/generator/init

  Initialize a new hex project. This will create all the necessary files for
  a new hex project.

  To generate a project in the './my-project' subdirectory:
    deno run -A ${relativePath} ./my-project

  To generate a project in the current directory:
    deno run -A ${relativePath} .

  Print this message:
    deno run ${relativePath} --help
  `;

  console.log(messageContents);
};

const showVersion = () => {
  const messageContents = `hex/generator/init version ${VERSION}`;

  console.log(messageContents);
};

const init = async (args: string[]) => {
  const params = flags.parse(args, {
    boolean: ["help", "version"],
    string: ["template"],
    default: {},
  });

  if (params.version) {
    showVersion();
    return;
  }

  if (params.help || params._.length === 0) {
    showHelp();
    return;
  }

  if (params._.length === 1) {
    const [projectPath] = params._ as string[];

    const relativeUrl = new URL(".", baseUrl);

    await generate(relativeUrl.href, projectPath, params.template);

    return;
  }

  console.log(`invalid command - try 'deno run ${relativePath} --help'`);
};

if (import.meta.main) {
  init(Deno.args);
}

export { init, init as default };

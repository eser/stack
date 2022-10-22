import { flags, pathPosix, streams } from "./deps.ts";

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

const readTemplate = async (templatePath: string) => {
  const template = await import(templatePath, { assert: { type: "json" } });

  return template;
};

const generateProject = async (projectPath: string, template?: string) => {
  const template_ = template ?? "default";
  const templatePath = `./templates/${template_}`;
  const templateContent = await readTemplate(`${templatePath}/template.json`);

  const relativeUrl = new URL(".", baseUrl);

  console.log(`Creating ${projectPath}...`);
  await Deno.mkdir(projectPath, { recursive: true });

  for (const file of templateContent.default.files) {
    const sourcePath = `${relativeUrl.href}${
      pathPosix.join(templatePath, "files", file)
    }`;
    const targetPath = pathPosix.join(projectPath, file);

    console.log(`Copying ${targetPath}...`);

    const targetPathDirectory = pathPosix.dirname(targetPath);
    await Deno.mkdir(targetPathDirectory, { recursive: true });

    let sourceStream: Deno.Reader | undefined;
    if (relativeUrl.protocol === "file:") {
      sourceStream = await Deno.open(pathPosix.fromFileUrl(sourcePath));
    } else {
      sourceStream = await fetch(sourcePath)
        .then((response) => response.body)
        .then((body) => body?.getReader())
        .then((reader) =>
          (reader !== undefined)
            ? streams.readerFromStreamReader(reader)
            : undefined
        );
    }

    if (sourceStream === undefined) {
      throw new Error(`source stream reader is undefined for '${sourcePath}'`);
    }

    const targetStream = await Deno.open(targetPath, {
      create: true,
      write: true,
    });
    await streams.copy(sourceStream, targetStream);
  }

  console.log("done.");
};

const showHelp = () => {
  const messageContents = `hex/generator/init

  Initialize a new hex web project. This will create all the necessary files for
  a new web project.

  To generate a project in the './my_project' subdirectory:
    deno run -A ${relativePath} ./my_project

  To generate a project in the current directory:
    deno run ${relativePath} .

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

    await generateProject(projectPath, params.template);

    return;
  }

  console.log(`invalid command - try 'deno run ${relativePath} --help'`);
};

if (import.meta.main) {
  init(Deno.args);
}

export { init, init as default };

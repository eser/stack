import { flags, pathPosix } from "./deps.ts";

const VERSION = "0.0.1";

const getRelativePath = () => {
  const url = new URL(import.meta.url);

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

  const relativeUrl = new URL(".", import.meta.url);

  console.log(`Creating ${projectPath}...`);
  await Deno.mkdir(projectPath, { recursive: true });

  for (const file of templateContent.default.files) {
    const sourcePath = pathPosix.join(
      relativeUrl.pathname,
      templatePath,
      "files",
      file,
    );
    const targetPath = pathPosix.join(projectPath, file);

    console.log(`Copying ${targetPath}...`);

    const targetPathDirectory = pathPosix.dirname(targetPath);
    await Deno.mkdir(targetPathDirectory, { recursive: true });

    await Deno.copyFile(sourcePath, targetPath);
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

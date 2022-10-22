import { pathPosix } from "./deps.ts";
import { readTemplate } from "./template-reader.ts";
import { copy } from "./copy.ts";

const generate = async (
  basePath: string,
  projectPath: string,
  template?: string,
) => {
  const templateFolder = `./templates/${template ?? "default"}`;
  const templateContent = await readTemplate(templateFolder);

  console.log(`Creating ${projectPath}...`);
  await Deno.mkdir(projectPath, { recursive: true });

  for (const file of templateContent.default.files) {
    const sourcePath = `${basePath}${
      pathPosix.join(`${templateFolder}/files`, file)
    }`;
    const targetPath = pathPosix.join(projectPath, file);

    console.log(`Copying ${targetPath}...`);

    const targetPathDirectory = pathPosix.dirname(targetPath);
    await Deno.mkdir(targetPathDirectory, { recursive: true });

    copy(sourcePath, targetPath);
  }

  console.log("done.");
};

export { generate, generate as default };

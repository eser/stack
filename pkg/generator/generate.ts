import { path } from "./deps.ts";
import { readTemplate } from "./template-reader.ts";
import { copy } from "./copy.ts";

export const generate = async (
  basePath: string,
  projectPath: string,
  templateName?: string,
) => {
  const templateFolder = `../../etc/fw/templates/${templateName ?? "default"}`;

  const template = await readTemplate(templateFolder).then((mod) =>
    mod.default
  );

  console.log(
    `Creating "${template.name} ${template.version}" on ${projectPath}...`,
  );
  await Deno.mkdir(projectPath, { recursive: true });

  for (const file of template.files) {
    const sourcePath = path.posix.join(
      basePath,
      `${templateFolder}/files`,
      file,
    );
    const targetPath = path.posix.join(projectPath, file);

    console.log(`Copying ${targetPath}...`);

    const targetPathDirectory = path.posix.dirname(targetPath);
    await Deno.mkdir(targetPathDirectory, { recursive: true });

    copy(sourcePath, targetPath);
  }

  console.log("done.");
};

export { generate as default };

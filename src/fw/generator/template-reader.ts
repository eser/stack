const fetchTemplate = async (templatePath: string) => {
  const template = await import(templatePath, { assert: { type: "json" } });

  return template;
};

export const readTemplate = (templateFolder: string) => {
  const templateFile = `${templateFolder}/template.json`;

  return fetchTemplate(templateFile);
};

export { readTemplate as default };

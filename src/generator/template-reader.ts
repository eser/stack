const fetchTemplate = async (templatePath: string) => {
  const template = await import(templatePath, { assert: { type: "json" } });

  return template;
};

const readTemplate = (templateFolder: string) => {
  const templateFile = `${templateFolder}/template.json`;

  return fetchTemplate(templateFile);
};

export { readTemplate, readTemplate as default };

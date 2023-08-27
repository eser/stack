export const story = {
  nameSingular: "Story",
  namePlural: "Stories",
  filePathPattern: "./content/**/*.md",
  fields: {
    title: {
      type: "string",
      description: "The title of the static page",
      required: true,
    },
    date: {
      type: "date",
      description: "The date of the static page",
      required: true,
    },
    url: {
      type: "string",
      description: "The url of the static page",
      resolve: (item) => {
        const [, title, lang] = /stories\/([^\.]*)\.(.*)/.exec(
          item.filePath,
        );

        return `/${lang}/stories/${title}`;
      },
    },
  },
};

export { story as default };

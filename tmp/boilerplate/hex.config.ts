const hexConfig = {
  urls: {
    structure: "/[lang]/[...path]",
    rewrites: [
      // {
      //   source: "/",
      //   destination: "/en/"
      // }
    ],
  },

  i18n: {
    languages: [
      "en",
      "tr"
    ]
  },
};

export { hexConfig as default, hexConfig };

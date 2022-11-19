import { rollup } from "npm:rollup";
// deno-lint-ignore no-unused-vars
import postcss from "npm:postcss";
import rollupPostcss from "npm:rollup-plugin-postcss";

const inputOptions = {
  input: {
    entry: "./src/app/global.css",
  },
  plugins: [
    rollupPostcss({
      plugins: [],
      inject: false,
      extract: true,
      sourceMap: true,
    }),
  ],
};

const outputOptionsList = [
  {
    dir: "build",
    format: "es",
    chunkFileNames: "[name]-[hash].js",
    entryFileNames: "[name]-[hash].js",
    compact: true,
    generatedCode: "es2015",
    // preserveModules: true,
    sourcemap: true,
  },
];

// deno-lint-ignore no-explicit-any
async function generateOutputs(bundle: any) {
  for (const outputOptions of outputOptionsList) {
    // generate output specific code in-memory
    // you can call this function multiple times on the same bundle object
    // replace bundle.generate with bundle.write to directly write to disk
    const { output } = await bundle.generate(outputOptions);

    for (const chunkOrAsset of output) {
      if (chunkOrAsset.type === "asset") {
        // For assets, this contains
        // {
        //   fileName: string,              // the asset file name
        //   source: string | Uint8Array    // the asset source
        //   type: 'asset'                  // signifies that this is an asset
        // }
        console.log("Asset", chunkOrAsset);
      } else {
        // For chunks, this contains
        // {
        //   code: string,                  // the generated JS code
        //   dynamicImports: string[],      // external modules imported dynamically by the chunk
        //   exports: string[],             // exported variable names
        //   facadeModuleId: string | null, // the id of a module that this chunk corresponds to
        //   fileName: string,              // the chunk file name
        //   implicitlyLoadedBefore: string[]; // entries that should only be loaded after this chunk
        //   imports: string[],             // external modules imported statically by the chunk
        //   importedBindings: {[imported: string]: string[]} // imported bindings per dependency
        //   isDynamicEntry: boolean,       // is this chunk a dynamic entry point
        //   isEntry: boolean,              // is this chunk a static entry point
        //   isImplicitEntry: boolean,      // should this chunk only be loaded after other chunks
        //   map: string | null,            // sourcemaps if present
        //   modules: {                     // information about the modules in this chunk
        //     [id: string]: {
        //       renderedExports: string[]; // exported variable names that were included
        //       removedExports: string[];  // exported variable names that were removed
        //       renderedLength: number;    // the length of the remaining code in this module
        //       originalLength: number;    // the original length of the code in this module
        //       code: string | null;       // remaining code in this module
        //     };
        //   },
        //   name: string                   // the name of this chunk as used in naming patterns
        //   referencedFiles: string[]      // files referenced via import.meta.ROLLUP_FILE_URL_<id>
        //   type: 'chunk',                 // signifies that this is a chunk
        // }
        console.log("Chunk", chunkOrAsset.modules);
        console.log(chunkOrAsset.code);
      }
    }
  }
}

async function build() {
  let bundle;
  // let buildFailed = false;

  try {
    // create a bundle
    bundle = await rollup(inputOptions);

    // an array of file names this bundle depends on
    console.log(bundle.watchFiles);

    await generateOutputs(bundle);
  } catch (error) {
    // buildFailed = true;
    // do some error reporting
    console.error(error);
  }

  if (bundle) {
    // closes the bundle
    await bundle.close();
  }
}

build();

import { transformFile } from "@babel/core";
import { writeFile } from "fs";
import plugin from "../../src/plugin.js";
import { join } from "path";

const folder = import.meta.dirname;

const fileArgs = process.argv.slice(2);

const files = fileArgs.length > 0 ? fileArgs : ["transform", "no-transform"];

files.forEach((file) => {
  const input = join(folder, "..", file + ".before.js");
  const output = join(folder, "..", file + ".after.js");

  transformFile(
    input,
    {
      plugins: [plugin],
      code: true,
      ast: false,
    },
    (error, data) => {
      if (error || !data) {
        console.error(`Error transforming ${file}:`, error);
        return;
      }

      writeFile(output, data.code + "\n", (error: unknown) => {
        if (error) {
          console.error(`Error writing ${file}:`, error);
        } else {
          console.log(`Successfully transformed ${file}.`);
        }
      });
    },
  );
});

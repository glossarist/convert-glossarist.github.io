import { command, run, string, positional } from 'cmd-ts';
import { ExistingPath, Directory } from 'cmd-ts/batteries/fs';

import type { FileConvertor } from 'common';
import { fsPathToFiles } from './fs.js';

// TODO: Make x3duom work in Node by supplying some sort of DOMParser
// import x3duom from '@riboseinc/glossarist-x3duom';


const convertors: Record<string, FileConvertor<any, any, any>> = {
  // x3duom: x3duom(),
};


const app = command({
  name: 'convert',
  args: {
    convertorName: positional({ type: string, displayName: 'convertorName' }),
    sourcePath: positional({ type: ExistingPath, displayName: 'sourcePath' }),
    outDir: positional({ type: Directory, displayName: 'outDir' }),
  },
  handler: async ({ sourcePath, outDir, convertorName }) => {
    console.log({ convertorName, sourcePath, outDir });

    const convertor = convertors[convertorName];

    if (!convertor) {
      throw new Error("No convertor with such name");
    }

    function getFileStream() {
      return fsPathToFiles(sourcePath);
    }

    function getItemStream() {
      return convertor!.parseInput(getFileStream);
    }

    for await (const item of convertor.generateItems(getItemStream)) {
      console.log("Got item", JSON.stringify(item));
    }
  },
});

run(app, process.argv.slice(2));

// import type { FileConvertor } from '../../common/src/index.js';
import { type FileConvertor } from 'common/src/convertors/index.js';
import x3duom, { type X3DUOMConvertor } from '@riboseinc/glossarist-x3duom';
import grSheet, { type GRSheetConvertor } from '@riboseinc/parse-gr-sheet';
import { parseFilesFromUpload } from './uploads.js';


export const convertors = {
  x3duom: x3duom() as X3DUOMConvertor,
  'gr-sheet': grSheet() as GRSheetConvertor,
} as const;


export function isConvertor(value: string): value is keyof typeof convertors {
  return (convertors as any)[value] !== undefined;
}


export async function * parse(
  convertorName: string,
  input: (FileSystemFileEntry | FileSystemDirectoryEntry)[],
  onProgress?: (msg: string) => void,
  isAborted?: () => boolean,
): AsyncGenerator<unknown, void, undefined> {
  if (isConvertor(convertorName)) {
    const convertor: FileConvertor<any, any, any> = convertors[convertorName];

    async function * getFileStream() {
      for await (const entry of input) {
        yield * parseFilesFromUpload(entry);
      }
    }

    function getItemStream() {
      return convertor!.parseInput(getFileStream, { onProgress, isAborted });
    }

    const outputItemStream = convertor.generateItems(getItemStream, { onProgress, isAborted });

    for await (const outputItem of outputItemStream) {
      if (!isAborted?.()) {
        yield outputItem;
      } else {
        throw new Error("Interrupted by user");
      }
    }
  } else {
    throw new Error("No matching convertor found");
  }
}

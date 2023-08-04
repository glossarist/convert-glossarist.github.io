import type { FileConvertor } from '../../common/src/index.js';
import x3duom from '@riboseinc/glossarist-x3duom';
import { parseFilesFromUpload } from './uploads.js';


export const convertors: Record<string, FileConvertor<any>> = {
  x3duom: x3duom(),
};


export async function * parse(
  convertorName: string,
  input: (FileSystemFileEntry | FileSystemDirectoryEntry)[],
  linkURNPrefix?: string,
  onProgress?: (msg: string) => void,
) {
  const convertor = convertors[convertorName];
  if (!convertor) {
    throw new Error("No convertor with such name found");
  }

  async function * getFileStream() {
    for await (const entry of input) {
      yield * parseFilesFromUpload(entry);
    }
  }

  function getItemStream() {
    return convertor!.parseInput(getFileStream, { onProgress });
  }

  const conceptStream = convertor.readConcepts(getItemStream, { onProgress });

  for await (const conceptWithID of conceptStream) {
    yield conceptWithID;
  }
}

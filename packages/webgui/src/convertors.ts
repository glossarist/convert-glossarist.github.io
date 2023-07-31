import type { FileConvertor } from '../../common/src/index.js';
import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';
import x3duom from '../../x3duom/src/index.js';
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

  if (convertor.parseLinks) {
    const concepts: Record<string, LocalizedConceptData> = {};
    for await (const [id, concept] of conceptStream) {
      concepts[id] = concept;
    }
    function getConcepts<T extends string[]>(ids: T): { [K in keyof T]: LocalizedConceptData | null } {
      return ids.map(id => concepts[id] ?? null) as { [K in keyof T]: LocalizedConceptData | null };
    }
    for (const localizedConceptWithID of Object.entries(concepts)) {
      const [, concept] = localizedConceptWithID;
      for (const val of [...concept.definition, ...concept.notes, ...concept.examples]) {
        val.content = convertor.parseLinks(val.content, { getConcepts, linkURNPrefix });
      }
      yield localizedConceptWithID;
    }
  } else {
    for await (const conceptWithID of conceptStream) {
      yield conceptWithID;
    }
  }
}

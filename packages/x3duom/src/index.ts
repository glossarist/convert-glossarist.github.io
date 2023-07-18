import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData';
import type { Designation, Expression } from '@riboseinc/paneron-extension-glossarist/models/concepts';
import type { ProgressHandler, FileConvertor } from 'common';


export function getConvertor(): FileConvertor<IntermediateItem> {
  return {
    label: "X3D UOM XML",
    inputDescription: "An XML file, or a directory with XML files, containing terms in X3D UOM format",
    parseInput,
    readConcepts,
  };
}


const decoder = new TextDecoder('utf-8');
const parser = new DOMParser();


interface IntermediateItem {
  /** <enumeration> */
  el: Element;

  /** Properties of a designation that cannot be read from XML directly. */
  designationProperties: DesignationStub,
}


type DesignationStub =
    Pick<Designation, 'normative_status'>
  & Partial<Omit<Designation, 'designation'>>;


const parseInput = new TransformStream<File, IntermediateItem>({
  start() {},
  async transform(file, controller) {
    if (file !== null) {
      const rawXML = decoder.decode(await file.arrayBuffer());
      for await (const item of convertX3D(rawXML)) {
        controller.enqueue(item);
      }
    } else {
      controller.terminate();
    }
  },
});


const readConcepts = new TransformStream<IntermediateItem, LocalizedConceptData>({
  start() {},
  async transform(item, controller) {
    if (item !== null) {
      const concept = await parseLocalizedConcept(item);
      controller.enqueue(concept);
    } else {
      controller.terminate();
    }
  },
});


// const decodeX3DData: InputDecoder<IntermediateItem> = async function * (input) {
//   const files = input.isDirectory
//     ? (await getFiles(input as FileSystemDirectoryEntry))
//     : [input as FileSystemFileEntry];
//   for await (const fileEntry of files) {
//     const xmlString = await decodeFileEntryToString(fileEntry);
//     yield * convertX3D(xmlString);
//   }
// }


const convertX3D = async function* (xmlString: string) {
  const doc = parser.parseFromString(xmlString, 'text/xml');
  yield * readSimpleType('acronyms', doc.getElementsByName('acronymChoices'), undefined, true);
  yield * readSimpleType('term', doc.getElementsByName('glossaryChoices'), undefined);
}


function * readSimpleType(
  elType: string,
  simpleTypeEls: NodeListOf<HTMLElement>,
  onProgress?: ProgressHandler,
  isAbbreviation?: boolean,
) {
  const progressStage = `processing ${elType}`;
  for (const [containerIdx, container] of simpleTypeEls.entries()) {
    for (const [enumIdx, maybeEnumEl] of [...container.children].entries()) {
      const decimalIdx = parseFloat(`${containerIdx + 1}.${enumIdx + 1}`)
      onProgress?.(progressStage, decimalIdx, undefined);

      const expression: Pick<Expression, 'isAbbreviation'> = {}
      if (isAbbreviation) {
        expression.isAbbreviation = true;
      }

      const item: IntermediateItem = {
        el: maybeEnumEl,
        designationProperties: {
          normative_status: 'preferred',
          type: 'expression',
          ...expression,
        },
      };
      yield item;
    }
  }
}


async function parseLocalizedConcept(item: IntermediateItem): Promise<LocalizedConceptData> {
  if (item.el.localName === 'enumeration') {
    const definition = item.el.getAttribute('appinfo');
    const designation = item.el.getAttribute('value');
    const link = item.el.getAttribute('documentation');
    if (definition?.trim() && designation?.trim()) {
      return {
        language_code: 'eng',
        terms: [{ ...item.designationProperties, designation } as Designation], // TODO: Avoid cast
        definition: [{ content: definition }],
        notes: [],
        examples: [],
        authoritativeSource: link ? [{ link }] : [],
      };
    } else {
      throw new Error("Element is missing appinfo and value, required to extract definition and designation.");
    }
  } else {
    throw new Error("Unexpected element type");
  }
}

import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';
import type { Designation, Expression } from '@riboseinc/paneron-extension-glossarist/models/concepts.js';
import type { ProgressHandler, FileConvertor } from 'common';


/** Item obtained from processing an X3D UOM XML file. */
interface IntermediateItem {
  /** <enumeration> */
  el: Element;

  /** Properties of a designation that cannot be read from XML element itself. */
  designationProperties: DesignationStub,
}


type DesignationStub =
    Pick<Designation, 'normative_status'>
  & Partial<Omit<Designation, 'designation'>>;


interface X3DUOMConvertor extends FileConvertor<IntermediateItem> {}


export default function getConvertor(): X3DUOMConvertor {
  return {
    label: "X3D UOM XML",
    inputDescription: "An XML file, or a directory with XML files, containing terms in X3D UOM format",
    parseInput,
    readConcepts,
  };
}


const decoder = new TextDecoder('utf-8');
const parser = new DOMParser();


const parseInput: X3DUOMConvertor["parseInput"] =
async function * parseInput(fileGenerator, onProgress) {
  for await (const file of fileGenerator()) {
    const rawXML = decoder.decode(file.blob);
    onProgress?.(`Processing file ${file.name}`);
    try {
      const items = convertX3D(rawXML);
      for await (const item of items) {
        yield item;
      }
    } catch (e) {
      onProgress?.(`Error processing file ${file.name}: ${(e as any).toString?.() ?? 'no error information available'}`);
    }
  }
}


const readConcepts: X3DUOMConvertor["readConcepts"] =
async function * readConcepts(itemGenerator, onProgress) {
  for await (const item of itemGenerator()) {
    onProgress?.(`Processing <${item.el.localName}>`);
    try {
      yield await parseLocalizedConcept(item);
    } catch (e) {
      onProgress?.(`Failed to process <${item.el.localName}>: ${(e as any)?.toString?.() ?? 'no error information available'}`);
    }
  }
}


const convertX3D = async function* (xmlString: string) {
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const acronymContainers = doc.getElementsByName('acronymChoices');
  const glossaryContainers = doc.getElementsByName('glossaryChoices');
  if (acronymContainers.length < 1 && glossaryContainers.length < 1) {
    throw new Error("Specified file contained neither acronymChoices nor glossaryChoices");
  }
  yield * readSimpleType('acronyms', acronymContainers, undefined, true);
  yield * readSimpleType('term', glossaryContainers, undefined);
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

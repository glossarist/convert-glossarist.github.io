import yaml from 'js-yaml';

import type { ConceptData } from '@riboseinc/paneron-extension-glossarist/classes/concept';
import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData';
import type { Designation, Expression } from '@riboseinc/paneron-extension-glossarist/models/concepts';
import type { RegisterItem } from '@riboseinc/paneron-registry-kit/types';


const encoder = new TextEncoder();


interface Options {
  /** Progress handler invoked on every item. */
  onProgress?: (
    stageGerund: string,
    completed: number | undefined,
    total: number | undefined,
  ) => void;
}


/**
 * Main entry point.
 * Takes an XML string, asynchronously generates buffer datasets.
 * Assumes designations and definitions are in English: uses `eng` as `language_code`.
 */
const convertX3D:
(rawXML: string, opts?: Options) => AsyncGenerator<BufferDataset, void, void> =
async function* (rawXML, opts) {
  const doc = parser.parseFromString(rawXML, 'text/xml');

  for (const [containerIdx, container] of doc.getElementsByName('acronymChoices').entries()) {
    for (const [enumIdx, maybeEnumEl] of [...container.children].entries()) {
      const decimalIdx = parseFloat(`${containerIdx + 1}.${enumIdx + 1}`)
      opts?.onProgress?.("processing acronyms", decimalIdx, undefined);
      yield getDataset(processEnum(
        `acronym-${decimalIdx}`,
        maybeEnumEl,
        { isAbbreviation: true },
      ));
    }
  }

  for (const [containerIdx, container] of doc.getElementsByName('glossaryChoices').entries()) {
    for (const [enumIdx, maybeEnumEl] of [...container.children].entries()) {
      const decimalIdx = parseFloat(`${containerIdx + 1}.${enumIdx + 1}`)
      opts?.onProgress?.("processing acronyms", decimalIdx, undefined);
      yield getDataset(processEnum(
        `acronym-${decimalIdx}`,
        maybeEnumEl,
      ));
    }
  }
}


interface BufferDataset {
  [filePath: string]: Uint8Array
}

type ConceptPair = [RegisterItem<ConceptData>, RegisterItem<LocalizedConceptData>];


function getDataset(data: ConceptPair): BufferDataset {
  const [concept, localizedConcept] = data;
  return {
    [`concepts/${concept.id}.yaml`]:
      encoder.encode(yaml.dump(concept)),
    [`localized-concepts/${localizedConcept.id}.yaml`]:
      encoder.encode(yaml.dump(localizedConcept)),
  }
}


function processEnum(
  identifier: string,
  el: Element,
  opts?: { isAbbreviation?: boolean },
): ConceptPair {
  const conceptUUID = crypto.randomUUID();
  const localizedConceptUUID = crypto.randomUUID();
  const expressionStub: Omit<Expression, 'designation'> = {
    type: 'expression',
  };
  if (opts?.isAbbreviation) {
    expressionStub.isAbbreviation = opts.isAbbreviation;
  }
  const localizedConceptData = parseLocalizedConcept(
    el,
    expressionStub,
    { language_code: 'eng' },
  );
  const concept: ConceptData = {
    identifier,
    localizedConcepts: {
      eng: localizedConceptUUID,
    },
  };
  return [
    {
      ...makeDefaultRegisterItemStub(el),
      id: conceptUUID,
      data: concept,
    },
    {
      ...makeDefaultRegisterItemStub(el),
      id: localizedConceptUUID,
      data: localizedConceptData,
    },
  ];
}


export default convertX3D;


const parser = new DOMParser();


type RegisterItemStub = Omit<RegisterItem<any>, 'id' | 'data'>;
type LocalizedConceptStub =
    Partial<Omit<LocalizedConceptData, 'definition' | 'terms'>>
  & Pick<LocalizedConceptData, 'language_code'>;
type DesignationStub =
    Pick<Designation, 'normative_status'>
  & Partial<Omit<Designation, 'designation'>>;

interface StubGetter<F> {
  (el: Element): F;
}

const makeDefaultRegisterItemStub: StubGetter<RegisterItemStub> =
function makeRegisterItemStub() {
  return {
    dateAccepted: new Date(),
    status: 'valid',
  };
}


function parseLocalizedConcept(
  el: Element,
  designationStub: DesignationStub,
  localizedConceptStub: LocalizedConceptStub,
): LocalizedConceptData {
  if (el.localName === 'enumeration') {
    const definition = el.getAttribute('appinfo');
    const designation = el.getAttribute('value');
    const link = el.getAttribute('documentation');
    if (definition?.trim() && designation?.trim()) {
      return {
        ...localizedConceptStub,
        terms: [{ ...designationStub, designation } as Designation], // TODO: Avoid cast
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

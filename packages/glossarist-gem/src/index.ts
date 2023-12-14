import type { RegisterItem } from '@riboseinc/paneron-registry-kit/types';
import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';
import type { ConceptData } from '@riboseinc/paneron-extension-glossarist/classes/concept.js';
import type { AuthoritativeSource, Designation, Expression } from '@riboseinc/paneron-extension-glossarist/models/concepts.js';
import type { FileConvertor } from '../../common/src/convertors/index.js';
import { parse } from 'yaml';

import {
  type GlossaryRegisterConfig,
} from '../../common/src/glossary.js';


/** Item obtained from processing a gem export YAML file. */
interface IntermediateItem {
  filePath: string;
  uuid: string;
  fileData: Record<string, any>
}


export interface GlossaristGemConvertor
extends FileConvertor<
  IntermediateItem,
  | { classID: 'localized-concept', uuid: string, itemData: LocalizedConceptData }
  | { classID: 'concept', uuid: string, itemData: ConceptData },
  GlossaryRegisterConfig> {}


export default function getConvertor(): GlossaristGemConvertor {
  return {
    label: "glossarist-ruby output adapter",
    inputDescription: "A directory containing concept and localized-concept subdirectories with YAML files as output by glossarist-ruby gem",
    parseInput,
    generateItems,
    generateRegisterItems,
  };
}


const decoder = new TextDecoder('utf-8');


const parseInput: GlossaristGemConvertor["parseInput"] =
async function * parseInput(fileGenerator, opts) {
  let counter = 0;
  for await (const file of fileGenerator()) {

    if (opts?.isAborted?.()) { break; }
    counter += 1;

    function fileProgress(msg?: string) {
      const prefix = `Processing file #${counter}: ${file.fullPath}`;
      opts?.onProgress?.(msg ? `${prefix}: ${msg}` : prefix);
    }

    //console.debug("Got raw YAML", rawYAML);
    //console.debug("Got parsed YAML", parse(rawYAML));

    try {
      //const items = convertX3D(rawXML, fileProgress);
      //for await (const item of items) {
      //  yield item;
      //}

      const rawYAML = decoder.decode(file.blob);
      const data = parse(rawYAML);

      fileProgress("Deserializing YAML");

      const uuid = file.name.split('.')[0] || '';
      if (uuid.trim() !== '') {
        yield {
          uuid,
          filePath: file.fullPath,
          fileData: data,
        };
      } else {
        throw new Error("Invalid filename (no UUID found)");
      }
    } catch (e) {
      fileProgress(`Error: ${(e as any).toString?.() ?? "No error information available"}`);
    }
  }
}


const generateItems: GlossaristGemConvertor["generateItems"] =
async function * generateConcepts(itemGenerator, opts) {
  let universalConceptIdx = 1;

  /**
   * Maps localized concept UUID to universal concept identifier.
   * NOTE: Relies on localized-concept items to be processed before concept items.
   */
  const idMap: Record<string, string> = {
  };

  for await (const item of itemGenerator()) {
    if (opts?.isAborted?.()) { break; }

    const isUniversal = item.filePath.startsWith('/concepts/concept');

    function itemProgress(msg?: string) {
      const conceptLabel = isUniversal
        ? `universal concept ${universalConceptIdx}`
        : item.fileData.data.terms?.[0]?.designation;

      const prefix = `Parsing ${item.uuid}: ${conceptLabel}`;
      opts?.onProgress?.(msg ? `${prefix}: ${msg}` : prefix);
    }
    try {
      if (isUniversal) {
        const identifier = idMap[item.fileData.data.localized_concepts.eng];
        if (!identifier) {
          opts?.onProgress?.(`error: haven’t detected identifier for universal concept ${item.uuid}`);
        }
        yield {
          classID: 'concept',
          uuid: item.uuid,
          itemData: parseUniversalConcept(item, itemProgress, identifier ?? `concept #${universalConceptIdx}`)
        };
        universalConceptIdx += 1;
      } else {
        idMap[item.uuid] = item.fileData.data.id;
        yield {
          classID: 'localized-concept',
          uuid: item.uuid,
          itemData: parseLocalizedConcept(item, itemProgress),
        };
      }
    } catch (e) {
      itemProgress(`Error: ${(e as any)?.toString?.() ?? 'No error information available'}`);
    }
  }
}


const generateRegisterItems: GlossaristGemConvertor["generateRegisterItems"] =
async function * generateGlossaryRegisterItems(itemGenerator, opts) {
  for await (const item of itemGenerator) {
    const itemBase: RegisterItem<any> = {
      id: item.uuid,
      dateAccepted: new Date(),
      status: 'valid',
      data: {},
    };
    if (item.classID === 'concept') {
      const concept: RegisterItem<ConceptData> = {
        ...itemBase,
        data: item.itemData,
      };
      yield { 'concept': concept };
    } else if (item.classID === 'localized-concept') {
      const localizedConcept: RegisterItem<LocalizedConceptData> = {
        ...itemBase,
        data: item.itemData,
      };
      yield { 'localized-concept': localizedConcept };
    }
  }
}


function parseUniversalConcept(
  item: IntermediateItem,
  _onProgress: ((msg: string) => void) | undefined,
  identifier: string,
): ConceptData {
  return {
    identifier,
    localizedConcepts:
      item.fileData.data.localized_concepts as ConceptData["localizedConcepts"],
  };
}


function parseLocalizedConcept(
  item: IntermediateItem,
  onProgress: ((msg: string) => void) | undefined,
): LocalizedConceptData {
  const data = item.fileData.data;
  if (!data.terms) {
    throw new Error("No terms found for concept");
  }
  const languageCodeMap: Record<string, string> = { 'fre': 'fra' };
  const localizedConceptData: LocalizedConceptData = {
    language_code: languageCodeMap[data.language_code] ?? data.language_code,
    definition: data.definition,
    notes: data.notes,
    examples: data.examples,
    terms: data.terms.map((t: any) => {
      const designationBase: Pick<Designation, "normative_status" | "designation"> = {
        normative_status: t.normative_status as Designation["normative_status"],
        designation: t.designation as Designation["designation"],
      };
      if (t.type === 'expression' || t.type === 'abbreviation') {
        const term: Expression = {
          type: 'expression',
          partOfSpeech: t.adj ? 'adjective' : t.adverb ? 'adverb' : t.noun ? 'noun' : t.verb ? 'verb' : undefined,
          isParticiple: t.participle,
        };
        if (t.type === 'abbreviation') {
          term.isAbbreviation = true;
        }
        const result: Designation = { ...designationBase, ...term };
        return result;
      } else {
        onProgress?.(`error: unsupported designation type: ${t.type}`);
        return null;
      }
    }).filter((v: Designation | null) => v !== null),
    authoritativeSource: data.source?.map((s: any) => {
      if (['modified', 'identical'].indexOf(s.status) < 0) {
        onProgress?.(`error: invalid auth. source relationship type: ${s.status}`);
      }
      const src: AuthoritativeSource = {
        relationship: {
          type: s.status as 'modified' | 'identical',
        },
        ref: s.origin?.ref,
        clause: s.origin?.clause,
        link: s.origin?.link,
      };
      return src;
    }),
  };
  return localizedConceptData;
}

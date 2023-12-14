import type { RegisterItem, RegisterConfiguration, ItemClassConfiguration } from '@riboseinc/paneron-registry-kit/types';

import type { ConceptData } from '@riboseinc/paneron-extension-glossarist/classes/concept.js';
import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';
import type { Designation } from '@riboseinc/paneron-extension-glossarist/models/concepts.js';

import { teeAsync } from './util.js';

import type {
  CommonStreamProcessingOptions,
  RegisterItemsByClassID,
  RegisterItemConversionOpts,
} from './convertors/base.js';


// TODO: This should be possible to obtain using `typeof itemClassConfiguration`
// with Glossarist extension’s itemClassConfiguration, but TS somehow loses
// type information about register item payloads.
export interface GlossaryRegisterConfig extends RegisterConfiguration<{
  'concept': ItemClassConfiguration<ConceptData>;
  'localized-concept': ItemClassConfiguration<LocalizedConceptData>;
}> {
  subregisters: undefined,
}


/**
 * Converts a stream of ID & localized concept tuples
 * to a stream of objects with register item keyed by class ID.
 */
export async function * asRegisterItemsWithInferredUniversal(
  concepts: AsyncGenerator<LocalizedConceptData, void, undefined>,
  opts?: RegisterItemConversionOpts,
): AsyncGenerator<RegisterItemsByClassID<GlossaryRegisterConfig>, void, undefined> {
  const now = new Date();
  let idx = 0;

  for await (const conceptData of concepts) {
    const designation = conceptData.terms[0]!.designation;
    const identifier = /* opts?.conceptIDMaker?.(idx, conceptData) ?? */ `${idx + 1}`;
    opts?.onProgress?.(`Outputting as register items: #${idx + 1} (${designation}) (using ID “${identifier}”)`);
    const universalUUID = crypto.randomUUID();
    const localizedUUID = crypto.randomUUID();
    const universalConcept: RegisterItem<ConceptData> = {
      id: universalUUID,
      data: {
        identifier,
        localizedConcepts: {
          [conceptData.language_code]: localizedUUID,
        },
      },
      status: 'valid',
      dateAccepted: now,
    };
    const localizedConcept: RegisterItem<LocalizedConceptData> = {
      id: localizedUUID,
      data: conceptData,
      status: 'valid',
      dateAccepted: now,
    };

    yield {
      concept: universalConcept,
      'localized-concept': localizedConcept,
    };
    idx += 1;
  }
}


export async function * processLinks(
  linkParser: LinkParser,
  items: AsyncGenerator<RegisterItemsByClassID<GlossaryRegisterConfig>, void, undefined>,
  opts: LinkProcessingOptions,
): AsyncGenerator<RegisterItemsByClassID<GlossaryRegisterConfig>, void, undefined> {
  const [itemStream1, itemStream2] = teeAsync(items);

  // Populate cache for lookups
  const itemCache: {
    concept: RegisterItem<ConceptData>[],
    'localized-concept': RegisterItem<LocalizedConceptData>[],
  } = {
    concept: [],
    'localized-concept': [],
  };
  for await (const item of itemStream1) {
    if (item['concept']) {
      itemCache['concept'].push(item['concept']);
    }
    if (item['localized-concept']) {
      itemCache['localized-concept'].push(item['localized-concept']);
    }
  }

  for await (const item of itemStream2) {
    if (item['localized-concept']) {
      // Modify localized concept item data in-place,
      // resolving links if possible.
      const { id, data: { terms, definition, notes, examples } } = item['localized-concept'];
      const primaryDesignation = terms[0]!.designation;
      opts?.onProgress?.(`Formatting links for localized concept ${id} (${primaryDesignation})`);
      for (const val of [...definition, ...notes, ...examples]) {
        val.content = linkParser(val.content, {
          forMatchingDesignation: function formatLinkForMatchingDesignation(predicate) {
            const localizedConcept = itemCache['localized-concept'].find(({ data: { terms } }) => {
              return terms.find(predicate);
            });
            if (localizedConcept) {
                const universalConcept = itemCache['concept'].find(({ data: { localizedConcepts } }) => {
                  return localizedConcepts.eng === localizedConcept.id;
                });
                if (universalConcept) {
                  const linkedPrimaryDesignation = localizedConcept.data.terms[0]!.designation;
                  opts?.onProgress?.(`Resolved a link to ${linkedPrimaryDesignation}`);
                  return formatLink(
                    opts.linkURNPrefix,
                    universalConcept.data.identifier,
                    linkedPrimaryDesignation,
                  );
                } else {
                  opts?.onProgress?.(`Error: link resolver: no universal concept linking to ${localizedConcept.id}`);
                  return undefined;
                }
            } else {
              opts?.onProgress?.(`Error: link resolver: no localized concept with designation matching given predicate`);
              return undefined;
            }
          },
          forConceptID: function formatLinkForConceptID(conceptID) {
            return formatLink(opts.linkURNPrefix, conceptID);
          },
        });
      }
    }
    yield item;
  }
}


function formatLink(linkURNPrefix: string, conceptIdentifier: string, designation?: string): string {
  if (designation) {
    return `{{${linkURNPrefix!}${conceptIdentifier},${designation}}}`;
  } else {
    return `{{${linkURNPrefix!}${conceptIdentifier}}}`;
  }
}


export interface LinkParser {
  (
    text: string,
    getLinkText: {
      forMatchingDesignation: (predicate: (c: Designation) => boolean) =>
        string | undefined,
      forConceptID: (id: string) =>
        string | undefined,
    }
  ): string;
}



interface LinkProcessingOptions extends CommonStreamProcessingOptions {
  /**
   * If links are to be recognized, appropraite URN namespace is required.
   * This option should contain the entire URN prefix with trailing colon.
   * (Concept identifier will be appended to that prefix, and links
   * will be formatted with `{{` and `}}`.)
   */
  linkURNPrefix: string;
}

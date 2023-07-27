import type { ConceptData } from '@riboseinc/paneron-extension-glossarist/classes/concept.js';
import type { RegisterItem, RegisterConfiguration, ItemClassConfiguration } from '@riboseinc/paneron-registry-kit/types';
import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';

import type { LocalizedConceptWithID } from './base.js';


export type { Convertor, FileConvertor, File } from './base.js';



// TODO: This should be possible to obtain using `typeof itemClassConfiguration`
// with Glossarist extension’s itemClassConfiguration, but TS somehow loses
// type information about register item payloads.
interface GlossaryRegisterConfig extends RegisterConfiguration<{
  'concept': ItemClassConfiguration<ConceptData>;
  'localized-concept': ItemClassConfiguration<LocalizedConceptData>;
}> {
  subregisters: undefined,
}


type GetRegisterItemPayloadType<T> =
  T extends ItemClassConfiguration<infer K> ? K : never;

type RegisterItemsByClassID<
  P extends RegisterConfiguration,
> = {
  [K in keyof P["itemClassConfiguration"]]?:
    RegisterItem<GetRegisterItemPayloadType<P["itemClassConfiguration"][K]>>
}


/**
 * Converts a stream of ID & localized concept tuples
 * to a stream of item class & register item tuples
 * for a Glossarist register.
 */
export async function * asRegisterItems(
  concepts: AsyncGenerator<LocalizedConceptWithID, void, undefined>,
): AsyncGenerator<RegisterItemsByClassID<GlossaryRegisterConfig>, void, undefined> {
  const now = new Date();
  for await (const [id, conceptData] of concepts) {
    const universalUUID = crypto.randomUUID();
    const localizedUUID = crypto.randomUUID();
    const universalConcept: RegisterItem<ConceptData> = {
      id: universalUUID,
      data: {
        identifier: id,
        localizedConcepts: {
          eng: localizedUUID,
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
  }
}

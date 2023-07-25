export type { Convertor, FileConvertor, File } from './base.js';

import type { LocalizedConceptWithID } from './base.js';
import type { LocalizedConceptData } from '@riboseinc/paneron-extension-glossarist/classes/localizedConcept/LocalizedConceptData.js';
import type { ConceptData } from '@riboseinc/paneron-extension-glossarist/classes/concept.js';
import type { RegisterItem } from '@riboseinc/paneron-registry-kit/types';


export async function * asRegisterItems(
  concepts: AsyncGenerator<LocalizedConceptWithID, void, undefined>,
): AsyncGenerator<RegisterItem<any>, void, undefined> {
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
    yield universalConcept;
    yield localizedConcept;
  }
}

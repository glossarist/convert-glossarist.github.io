import type { RegisterItem, RegisterConfiguration, ItemClassConfiguration } from '@riboseinc/paneron-registry-kit/types';
import type { DatumData } from '@riboseinc/paneron-extension-geodetic-registry/classes/datum.js';
import type { TransformationData } from '@riboseinc/paneron-extension-geodetic-registry/classes/transformation.js';
import type { ConversionData } from '@riboseinc/paneron-extension-geodetic-registry/classes/conversion.js';

import xlsx, { type Row } from 'read-excel-file';

import type { FileConvertor } from '../../common/src/convertors/index.js';


export interface GRSheetConvertor
extends FileConvertor<
  ParsedSheetItem,
  GRItem,
  GRConfig> {}


// TODO: This should be possible to obtain using `typeof itemClassConfiguration`
// with GR extension’s itemClassConfiguration, but TS somehow loses
// type information about register item payloads.
export interface GRConfig extends RegisterConfiguration<{
  "coordinate-ops--conversion": ItemClassConfiguration<ConversionData>,
  "coordinate-ops--transformation": ItemClassConfiguration<TransformationData>,
  "datums--engineering": ItemClassConfiguration<DatumData>,
}> {
  subregisters: undefined,
}


/** Intermediate item obtained after deserializing a sheet into JS. */
interface ParsedSheetItem {
  sheet: string;
  row: Row;
}


/** An output item representing some GR item (no register data). */
interface GRItem {
  /** GR item class (e.g., transformation) */
  itemType: string;
  itemData: Record<string, any>;
}


export default function getConvertor(): GRSheetConvertor {
  return {
    label: "ISO GR sheet",
    inputDescription: "A custom TC XLSX spreadsheet containing items to be proposed",
    parseInput,
    generateItems,
    generateRegisterItems,
  };
}


const parseInput: GRSheetConvertor["parseInput"] =
async function * parseSpreadsheetFiles(fileGenerator, opts) {
  // We can assume there to be multiple files.
  for await (const file of fileGenerator()) {
    function fileProgress(msg?: string) {
      const prefix = `Processing file ${file.name}`;
      opts?.onProgress?.(msg ? `${prefix}: ${msg}` : prefix);
    }

    try {
      // TODO: Obtain a list of sheets first, and iterate through all sheets.
      const rows = await xlsx(file.blob);
      for await (const row of rows) {
        yield { sheet: '', row };
      }
    } catch (e) {
      fileProgress(`Error: ${(e as any).toString?.() ?? "No error information available"}`);
    }
  }
}


const generateItems: GRSheetConvertor["generateItems"] =
async function * generateGRItems(parsedSheetItems, opts) {
  for await (const sheetItem of parsedSheetItems()) {
    
    const item: GRItem = turnSheetItemIntoGRItem(sheetItem);
    opts?.onProgress?.(`Creating GR item ${item.itemType}`);
    yield item;
  }
}


const generateRegisterItems: GRSheetConvertor["generateRegisterItems"] =
async function * generateGRItems(grItems, opts) {
  // Current timestamp
  const dateAccepted = new Date();
  let idx = 0;
  for await (const { itemType, itemData } of grItems) {
    const id = crypto.randomUUID();
    const item: RegisterItem<any> = {
      id,
      data: itemData,
      dateAccepted,
      status: 'valid',
    }
    yield {
      [itemType]: item,
    }
    opts?.onProgress?.(`Outputting as register items: #${idx + 1} (UUID “${id}”)`);
  }
}

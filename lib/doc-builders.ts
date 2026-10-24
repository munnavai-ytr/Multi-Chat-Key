/**
 * Re-export and compatibility layer for document builders.
 * The core implementation is in lib/docgen.ts.
 */

import { buildDocument as buildDocGen, BuildDocArgs, BuildDocResult as DocGenResult } from './docgen';

export type { Block as DocBlock, SheetData as DocSheet, SlideData as DocSlide, BuildDocArgs as BuildDocParams } from './docgen';

export interface BuildDocResult {
  data: ArrayBuffer;
  mime: string;
  name: string;
  size: number;
  format: string;
  blob?: Blob;
}

export async function buildDocument(params: BuildDocArgs): Promise<BuildDocResult> {
  const result: DocGenResult = await buildDocGen(params);
  const data = await result.blob.arrayBuffer();
  const format = (params.format || 'txt').toLowerCase();
  return {
    data,
    mime: result.mime,
    name: result.name,
    size: data.byteLength,
    format,
    blob: result.blob,
  };
}

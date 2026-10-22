import type { OcrColumnResult } from './ocr';

export interface OcrWorkerRequest {
  type: 'recognize';
  pixels: ArrayBuffer;
  width: number;
  height: number;
  boundaries: number[];
  mode: 'columns' | 'grid';
  removeLines: boolean;
}

export interface OcrCancelRequest { type: 'cancel' }

export type OcrWorkerResponse =
  | { type: 'progress'; progress: number; status: string }
  | { type: 'preview'; blob: Blob }
  | { type: 'complete'; result: OcrColumnResult }
  | { type: 'error'; message: string };

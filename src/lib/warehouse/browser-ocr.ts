import type { Worker } from 'tesseract.js';
let worker: Promise<Worker> | null = null;

export function prepareWarehouseOcr(onProgress?: (progress: number) => void): Promise<Worker> {
  if (!worker) worker = import('tesseract.js').then(async ({ createWorker, OEM }) => {
    return createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: '/warehouse-ocr/worker.min.js', corePath: '/warehouse-ocr', langPath: '/warehouse-ocr',
      workerBlobURL: false, cacheMethod: 'write',
      logger: (message) => { if (message.status === 'recognizing text') onProgress?.(Math.round(message.progress * 100)); },
    });
  }).catch((error: unknown) => { worker = null; throw error; });
  return worker;
}
export async function recognizeWarehousePhoto(file: File, onProgress?: (progress: number) => void): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) throw new Error('Usa una foto JPG, PNG o WebP de hasta 15 MB');
  const ocr = await prepareWarehouseOcr(onProgress);
  const result = await ocr.recognize(file);
  return result.data.text;
}

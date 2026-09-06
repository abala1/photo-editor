import { Adjustments } from "./filters";
import { applyFilterPixels } from "./pixelFilters";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Renders the source image onto a fresh canvas applying rotation, crop and CSS filters, baked in as pixels. */
export function renderToCanvas(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  adjustments: Adjustments,
  extraFilter: string | undefined,
  crop: CropRect | null
): HTMLCanvasElement {
  const rotation = ((adjustments.rotation % 360) + 360) % 360;
  const swapDims = rotation === 90 || rotation === 270;

  const cropRect: CropRect = crop ?? {
    x: 0,
    y: 0,
    width: sourceWidth,
    height: sourceHeight,
  };

  const outWidth = swapDims ? cropRect.height : cropRect.width;
  const outHeight = swapDims ? cropRect.width : cropRect.height;

  const canvas = document.createElement("canvas");
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el contexto de canvas");

  ctx.save();
  ctx.translate(outWidth / 2, outHeight / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(
    source,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    -cropRect.width / 2,
    -cropRect.height / 2,
    cropRect.width,
    cropRect.height
  );
  ctx.restore();

  const isNeutral =
    adjustments.brightness === 100 &&
    adjustments.contrast === 100 &&
    adjustments.saturation === 100 &&
    !extraFilter;
  if (!isNeutral) applyFilterPixels(canvas, adjustments, extraFilter);

  return canvas;
}

export type ExportFormat = "png" | "jpeg" | "webp";

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality: number
): Promise<Blob> {
  const mime = `image/${format}`;
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Falló la exportación de la imagen"));
      },
      mime,
      format === "png" ? undefined : quality
    );
  });
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = URL.createObjectURL(file);
  });
}

/** Applies a classic unsharp-mask style 3x3 convolution kernel to make edges crisper.
 * Runs fully locally/synchronously — no model, no network. */
export function sharpenCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const width = source.width;
  const height = source.height;
  const srcCtx = source.getContext("2d")!;
  const src = srcCtx.getImageData(0, 0, width, height);
  const srcData = src.data;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext("2d")!;
  const out = outCtx.createImageData(width, height);
  const outData = out.data;

  // prettier-ignore
  const kernel = [
    0, -1,  0,
   -1,  5, -1,
    0, -1,  0,
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const sy = Math.min(height - 1, Math.max(0, y + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.min(width - 1, Math.max(0, x + kx));
          const idx = (sy * width + sx) * 4;
          const weight = kernel[k++];
          r += srcData[idx] * weight;
          g += srcData[idx + 1] * weight;
          b += srcData[idx + 2] * weight;
        }
      }
      const outIdx = (y * width + x) * 4;
      outData[outIdx] = Math.max(0, Math.min(255, r));
      outData[outIdx + 1] = Math.max(0, Math.min(255, g));
      outData[outIdx + 2] = Math.max(0, Math.min(255, b));
      outData[outIdx + 3] = srcData[outIdx + 3];
    }
  }

  outCtx.putImageData(out, 0, 0);
  return outCanvas;
}

export function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo convertir el canvas a imagen"));
    img.src = canvas.toDataURL("image/png");
  });
}

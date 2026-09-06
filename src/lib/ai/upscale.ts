import { getSession, ort } from "./ort-setup";

const MODEL_URL = "/models/super-resolution-10.onnx";
const TILE_IN = 224;
const SCALE = 3;
const TILE_OUT = TILE_IN * SCALE;
const OVERLAP = 32;
const STEP = TILE_IN - OVERLAP;

interface YCbCr {
  y: Float32Array;
  cb: Float32Array;
  cr: Float32Array;
  width: number;
  height: number;
}

function rgbToYCbCr(imageData: ImageData): YCbCr {
  const { width, height, data } = imageData;
  const y = new Float32Array(width * height);
  const cb = new Float32Array(width * height);
  const cr = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    cb[i] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
    cr[i] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
  }
  return { y, cb, cr, width, height };
}

/** Pads a plane so each side is at least TILE_IN, by replicating edge pixels. */
function padPlane(plane: Float32Array, width: number, height: number, padW: number, padH: number): Float32Array {
  const out = new Float32Array(padW * padH);
  for (let py = 0; py < padH; py++) {
    const sy = Math.min(py, height - 1);
    for (let px = 0; px < padW; px++) {
      const sx = Math.min(px, width - 1);
      out[py * padW + px] = plane[sy * width + sx];
    }
  }
  return out;
}

/** Tile start offsets covering [0, size) with TILE_IN-wide windows, overlapping by
 * OVERLAP between neighbors and flush against the final edge. */
function tilePositions(size: number): number[] {
  if (size <= TILE_IN) return [0];
  const positions: number[] = [];
  let pos = 0;
  while (pos + TILE_IN < size) {
    positions.push(pos);
    pos += STEP;
  }
  positions.push(size - TILE_IN);
  return Array.from(new Set(positions)).sort((a, b) => a - b);
}

/** Runs each overlapping tile through the model and averages overlapping regions,
 * which hides the seams a naive non-overlapping tiling would leave at block edges. */
async function upscaleYPlane(
  yPadded: Float32Array,
  padW: number,
  padH: number,
  session: ort.InferenceSession,
  onProgress?: (msg: string) => void
): Promise<{ data: Float32Array; width: number; height: number }> {
  const xPositions = tilePositions(padW);
  const yPositions = tilePositions(padH);
  const outW = padW * SCALE;
  const outH = padH * SCALE;
  const accum = new Float32Array(outW * outH);
  const weight = new Float32Array(outW * outH);

  let tileIndex = 0;
  const totalTiles = xPositions.length * yPositions.length;

  for (const ty of yPositions) {
    for (const tx of xPositions) {
      tileIndex++;
      onProgress?.(`Ampliando bloque ${tileIndex}/${totalTiles}...`);

      const tile = new Float32Array(TILE_IN * TILE_IN);
      for (let py = 0; py < TILE_IN; py++) {
        const srcRow = (ty + py) * padW;
        for (let px = 0; px < TILE_IN; px++) {
          tile[py * TILE_IN + px] = yPadded[srcRow + tx + px] / 255;
        }
      }

      const inputTensor = new ort.Tensor("float32", tile, [1, 1, TILE_IN, TILE_IN]);
      const feeds: Record<string, ort.Tensor> = {};
      feeds[session.inputNames[0]] = inputTensor;
      const results = await session.run(feeds);
      const output = results[session.outputNames[0]].data as Float32Array;

      const dstOffX = tx * SCALE;
      const dstOffY = ty * SCALE;
      for (let py = 0; py < TILE_OUT; py++) {
        const dstRow = (dstOffY + py) * outW;
        const srcRow = py * TILE_OUT;
        for (let px = 0; px < TILE_OUT; px++) {
          const v = output[srcRow + px] * 255;
          const idx = dstRow + dstOffX + px;
          accum[idx] += Math.max(0, Math.min(255, v));
          weight[idx] += 1;
        }
      }
    }
  }

  for (let i = 0; i < accum.length; i++) accum[i] /= weight[i];

  return { data: accum, width: outW, height: outH };
}

function upscaleChromaPlane(
  plane: Float32Array,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number
): Float32Array {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);
  for (let i = 0; i < plane.length; i++) {
    const v = Math.max(0, Math.min(255, plane[i]));
    imgData.data[i * 4] = v;
    imgData.data[i * 4 + 1] = v;
    imgData.data[i * 4 + 2] = v;
    imgData.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(canvas, 0, 0, outWidth, outHeight);
  const outData = outCtx.getImageData(0, 0, outWidth, outHeight).data;

  const result = new Float32Array(outWidth * outHeight);
  for (let i = 0; i < result.length; i++) result[i] = outData[i * 4];
  return result;
}

export async function upscaleImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  onProgress?: (msg: string) => void
): Promise<HTMLCanvasElement> {
  const MAX_TILES = 150;
  const estimatedTiles = tilePositions(Math.max(width, TILE_IN)).length * tilePositions(Math.max(height, TILE_IN)).length;
  if (estimatedTiles > MAX_TILES) {
    throw new Error(
      `La imagen es muy grande para ampliar localmente (${estimatedTiles} bloques). Probá con una imagen más pequeña o recortada.`
    );
  }

  onProgress?.("Cargando modelo...");
  const session = await getSession(MODEL_URL);

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = width;
  srcCanvas.height = height;
  const srcCtx = srcCanvas.getContext("2d")!;
  srcCtx.drawImage(source, 0, 0, width, height);
  const imageData = srcCtx.getImageData(0, 0, width, height);

  const { y, cb, cr } = rgbToYCbCr(imageData);

  const padW = Math.max(width, TILE_IN);
  const padH = Math.max(height, TILE_IN);
  const yPadded = padPlane(y, width, height, padW, padH);

  const { data: yUp } = await upscaleYPlane(yPadded, padW, padH, session, onProgress);

  onProgress?.("Combinando canales de color...");
  const outWidth = width * SCALE;
  const outHeight = height * SCALE;
  const cbUp = upscaleChromaPlane(cb, width, height, outWidth, outHeight);
  const crUp = upscaleChromaPlane(cr, width, height, outWidth, outHeight);

  const paddedOutW = padW * SCALE;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outWidth;
  outCanvas.height = outHeight;
  const outCtx = outCanvas.getContext("2d")!;
  const outImageData = outCtx.createImageData(outWidth, outHeight);

  for (let py = 0; py < outHeight; py++) {
    for (let px = 0; px < outWidth; px++) {
      const idx = py * outWidth + px;
      const yVal = yUp[py * paddedOutW + px];
      const cbVal = cbUp[idx];
      const crVal = crUp[idx];
      const r = yVal + 1.402 * (crVal - 128);
      const g = yVal - 0.344136 * (cbVal - 128) - 0.714136 * (crVal - 128);
      const b = yVal + 1.772 * (cbVal - 128);
      outImageData.data[idx * 4] = Math.max(0, Math.min(255, r));
      outImageData.data[idx * 4 + 1] = Math.max(0, Math.min(255, g));
      outImageData.data[idx * 4 + 2] = Math.max(0, Math.min(255, b));
      outImageData.data[idx * 4 + 3] = 255;
    }
  }
  outCtx.putImageData(outImageData, 0, 0);

  onProgress?.("Listo");
  return outCanvas;
}

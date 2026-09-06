import { getSession, ort } from "./ort-setup";

const MODEL_URL = "/models/u2netp.onnx";
const INPUT_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

function imageToTensor(source: CanvasImageSource): ort.Tensor {
  const canvas = document.createElement("canvas");
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);

  const chwData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < plane; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    chwData[i] = (r - MEAN[0]) / STD[0];
    chwData[plane + i] = (g - MEAN[1]) / STD[1];
    chwData[plane * 2 + i] = (b - MEAN[2]) / STD[2];
  }
  return new ort.Tensor("float32", chwData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
}

/** Runs the mask through min-max normalization, mirroring the reference U2Net postprocessing. */
function normalizeMask(raw: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;
  for (const v of raw) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = (raw[i] - min) / range;
  return out;
}

export async function removeBackground(
  source: CanvasImageSource,
  width: number,
  height: number,
  onProgress?: (msg: string) => void
): Promise<HTMLCanvasElement> {
  onProgress?.("Cargando modelo...");
  const session = await getSession(MODEL_URL);

  onProgress?.("Analizando imagen...");
  const inputTensor = imageToTensor(source);
  const feeds: Record<string, ort.Tensor> = {};
  feeds[session.inputNames[0]] = inputTensor;
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  const mask = normalizeMask(output.data as Float32Array);

  onProgress?.("Aplicando máscara...");
  const maskCanvasSmall = document.createElement("canvas");
  maskCanvasSmall.width = INPUT_SIZE;
  maskCanvasSmall.height = INPUT_SIZE;
  const maskCtx = maskCanvasSmall.getContext("2d")!;
  const maskImageData = maskCtx.createImageData(INPUT_SIZE, INPUT_SIZE);
  for (let i = 0; i < mask.length; i++) {
    const alpha = Math.round(mask[i] * 255);
    maskImageData.data[i * 4] = 0;
    maskImageData.data[i * 4 + 1] = 0;
    maskImageData.data[i * 4 + 2] = 0;
    maskImageData.data[i * 4 + 3] = alpha;
  }
  maskCtx.putImageData(maskImageData, 0, 0);

  const maskCanvasFull = document.createElement("canvas");
  maskCanvasFull.width = width;
  maskCanvasFull.height = height;
  const maskFullCtx = maskCanvasFull.getContext("2d")!;
  maskFullCtx.imageSmoothingEnabled = true;
  maskFullCtx.drawImage(maskCanvasSmall, 0, 0, width, height);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext("2d")!;
  outCtx.drawImage(source, 0, 0, width, height);
  outCtx.globalCompositeOperation = "destination-in";
  outCtx.drawImage(maskCanvasFull, 0, 0);
  outCtx.globalCompositeOperation = "source-over";

  onProgress?.("Listo");
  return outCanvas;
}

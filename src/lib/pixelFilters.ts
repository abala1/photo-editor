import { Adjustments } from "./filters";

type Matrix3 = number[]; // 9 values, row-major: newC = M * [R,G,B]

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function multiply(a: Matrix3, b: Matrix3): Matrix3 {
  const r = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += a[i * 3 + k] * b[k * 3 + j];
      r[i * 3 + j] = sum;
    }
  }
  return r;
}

// The 3 matrices below are the exact formulas the CSS Filter Effects spec defines for
// saturate/sepia/hue-rotate (same ones browsers use for the DOM `filter` CSS property).
// Applying them by hand here means the exported file always matches what the on-screen
// preview shows, instead of depending on a WebKit canvas API with a history of gaps.
function saturateMatrix(s: number): Matrix3 {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

function sepiaMatrix(amount: number): Matrix3 {
  const full: Matrix3 = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
  return IDENTITY.map((v, i) => v * (1 - amount) + full[i] * amount);
}

function hueRotateMatrix(deg: number): Matrix3 {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ];
}

interface ParsedOp {
  name: string;
  value: number;
}

function parseFilterOps(filter: string): ParsedOp[] {
  const ops: ParsedOp[] = [];
  const re = /([a-z-]+)\(\s*([^)]+?)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter))) {
    const name = m[1];
    const raw = m[2].trim();
    let value: number;
    if (raw.endsWith("deg") || raw.endsWith("px")) value = parseFloat(raw);
    else if (raw.endsWith("%")) value = parseFloat(raw) / 100;
    else value = parseFloat(raw);
    ops.push({ name, value });
  }
  return ops;
}

/** Simple box blur, only ever used for the ~sub-pixel amounts our presets declare. */
function boxBlur(imageData: ImageData, radiusPx: number) {
  const radius = Math.max(1, Math.round(radiusPx));
  const strength = Math.min(1, radiusPx); // fractional radii blend lightly instead of snapping to a full pass
  const { width, height, data } = imageData;
  const src = new Uint8ClampedArray(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const sy = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.min(width - 1, Math.max(0, x + dx));
          const idx = (sy * width + sx) * 4;
          r += src[idx];
          g += src[idx + 1];
          b += src[idx + 2];
          count++;
        }
      }
      const idx = (y * width + x) * 4;
      data[idx] = src[idx] * (1 - strength) + (r / count) * strength;
      data[idx + 1] = src[idx + 1] * (1 - strength) + (g / count) * strength;
      data[idx + 2] = src[idx + 2] * (1 - strength) + (b / count) * strength;
    }
  }
}

/**
 * Bakes brightness/contrast/saturation + a preset's extra CSS-filter-like string
 * (grayscale/sepia/hue-rotate/saturate/blur) into the canvas's actual pixels, by hand.
 * This is what makes exported files match the live preview reliably: the preview uses
 * the DOM `filter` CSS property (solid support everywhere), but baking pixels via the
 * *canvas* `ctx.filter` API is what has historically been flaky in WebKit — so export
 * never uses it.
 */
export function applyFilterPixels(canvas: HTMLCanvasElement, adjustments: Adjustments, extraFilter?: string) {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  const brightnessFrac = adjustments.brightness / 100;
  const contrastFrac = adjustments.contrast / 100;

  let colorMatrix = saturateMatrix(adjustments.saturation / 100);
  let blurPx = 0;

  if (extraFilter) {
    for (const op of parseFilterOps(extraFilter)) {
      switch (op.name) {
        case "grayscale":
          colorMatrix = multiply(saturateMatrix(1 - op.value), colorMatrix);
          break;
        case "sepia":
          colorMatrix = multiply(sepiaMatrix(op.value), colorMatrix);
          break;
        case "hue-rotate":
          colorMatrix = multiply(hueRotateMatrix(op.value), colorMatrix);
          break;
        case "saturate":
          colorMatrix = multiply(saturateMatrix(op.value), colorMatrix);
          break;
        case "blur":
          blurPx = op.value;
          break;
      }
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * brightnessFrac;
    let g = data[i + 1] * brightnessFrac;
    let b = data[i + 2] * brightnessFrac;

    r = (r - 128) * contrastFrac + 128;
    g = (g - 128) * contrastFrac + 128;
    b = (b - 128) * contrastFrac + 128;

    const nr = colorMatrix[0] * r + colorMatrix[1] * g + colorMatrix[2] * b;
    const ng = colorMatrix[3] * r + colorMatrix[4] * g + colorMatrix[5] * b;
    const nb = colorMatrix[6] * r + colorMatrix[7] * g + colorMatrix[8] * b;

    data[i] = Math.max(0, Math.min(255, nr));
    data[i + 1] = Math.max(0, Math.min(255, ng));
    data[i + 2] = Math.max(0, Math.min(255, nb));
  }

  if (blurPx > 0) boxBlur(imageData, blurPx);

  ctx.putImageData(imageData, 0, 0);
}

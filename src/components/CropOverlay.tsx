import { useRef, useState, useCallback, useEffect } from "react";
import { CropRect } from "../lib/imageProcessing";

interface Props {
  displayWidth: number;
  displayHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  initialCrop: CropRect | null;
  aspectRatio: number | null;
  onChange: (naturalCrop: CropRect) => void;
}

type DragMode = "move" | "nw" | "ne" | "sw" | "se" | null;

const HANDLE_SIZE = 12;

export default function CropOverlay({
  displayWidth,
  displayHeight,
  naturalWidth,
  naturalHeight,
  initialCrop,
  aspectRatio,
  onChange,
}: Props) {
  const scale = displayWidth / naturalWidth;
  const toDisplay = useCallback(
    (r: CropRect) => ({
      x: r.x * scale,
      y: r.y * scale,
      width: r.width * scale,
      height: r.height * scale,
    }),
    [scale]
  );

  const [rect, setRect] = useState(() =>
    toDisplay(
      initialCrop ?? { x: 0, y: 0, width: naturalWidth, height: naturalHeight }
    )
  );

  // Tracks the last rect this component itself emitted, so the sync effect below
  // can tell "the crop changed externally (aspect preset, px input)" apart from
  // "React re-rendered after our own onChange" and avoid fighting an active drag.
  const lastEmitted = useRef<CropRect | null>(null);

  const dragState = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startRect: typeof rect;
  } | null>(null);

  const emitChange = useCallback(
    (r: typeof rect) => {
      const natural = {
        x: Math.round(r.x / scale),
        y: Math.round(r.y / scale),
        width: Math.round(r.width / scale),
        height: Math.round(r.height / scale),
      };
      lastEmitted.current = natural;
      onChange(natural);
    },
    [onChange, scale]
  );

  useEffect(() => {
    if (dragState.current) return; // don't fight an in-progress drag
    if (!initialCrop) return;
    const last = lastEmitted.current;
    const isOwnEcho =
      last &&
      last.x === initialCrop.x &&
      last.y === initialCrop.y &&
      last.width === initialCrop.width &&
      last.height === initialCrop.height;
    if (isOwnEcho) return;
    setRect(toDisplay(initialCrop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCrop]);

  const onPointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { mode, startX: e.clientX, startY: e.clientY, startRect: rect };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const ds = dragState.current;
    if (!ds || !ds.mode) return;
    const dx = e.clientX - ds.startX;
    const dy = e.clientY - ds.startY;
    let r = { ...ds.startRect };

    if (ds.mode === "move") {
      r.x = clamp(ds.startRect.x + dx, 0, displayWidth - r.width);
      r.y = clamp(ds.startRect.y + dy, 0, displayHeight - r.height);
    } else if (aspectRatio) {
      r = resizeWithAspect(ds.mode!, ds.startRect, dx, dy, aspectRatio, displayWidth, displayHeight);
    } else {
      if (ds.mode === "nw" || ds.mode === "sw") {
        const newX = clamp(ds.startRect.x + dx, 0, ds.startRect.x + ds.startRect.width - 20);
        r.width = ds.startRect.width - (newX - ds.startRect.x);
        r.x = newX;
      }
      if (ds.mode === "ne" || ds.mode === "se") {
        r.width = clamp(ds.startRect.width + dx, 20, displayWidth - ds.startRect.x);
      }
      if (ds.mode === "nw" || ds.mode === "ne") {
        const newY = clamp(ds.startRect.y + dy, 0, ds.startRect.y + ds.startRect.height - 20);
        r.height = ds.startRect.height - (newY - ds.startRect.y);
        r.y = newY;
      }
      if (ds.mode === "sw" || ds.mode === "se") {
        r.height = clamp(ds.startRect.height + dy, 20, displayHeight - ds.startRect.y);
      }
    }
    setRect(r);
    emitChange(r);
  };

  const onPointerUp = () => {
    dragState.current = null;
  };

  useEffect(() => {
    emitChange(rect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: displayWidth,
        height: displayHeight,
      }}
    >
      <svg
        width={displayWidth}
        height={displayHeight}
        style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      >
        <defs>
          <mask id="crop-mask">
            <rect width={displayWidth} height={displayHeight} fill="white" />
            <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} fill="black" />
          </mask>
        </defs>
        <rect
          width={displayWidth}
          height={displayHeight}
          fill="rgba(0,0,0,0.6)"
          mask="url(#crop-mask)"
        />
      </svg>
      <div
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute",
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          border: "2px solid #fff",
          cursor: "move",
          boxSizing: "border-box",
        }}
      >
        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
          <div
            key={corner}
            onPointerDown={onPointerDown(corner)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              position: "absolute",
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              background: "#fff",
              border: "1px solid #333",
              borderRadius: 2,
              cursor: `${corner}-resize`,
              top: corner.includes("n") ? -HANDLE_SIZE / 2 : undefined,
              bottom: corner.includes("s") ? -HANDLE_SIZE / 2 : undefined,
              left: corner.includes("w") ? -HANDLE_SIZE / 2 : undefined,
              right: corner.includes("e") ? -HANDLE_SIZE / 2 : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

type Rect = { x: number; y: number; width: number; height: number };

/** Resizes `start` from one corner while keeping `ratio` (width/height), anchoring
 * the opposite corner in place. Driven by whichever delta (dx or dy) implies the
 * larger size change, so the box tracks the cursor naturally in either direction. */
function resizeWithAspect(
  corner: "nw" | "ne" | "sw" | "se",
  start: Rect,
  dx: number,
  dy: number,
  ratio: number,
  boundsWidth: number,
  boundsHeight: number
): Rect {
  const MIN = 20;
  const sign = { nw: -1, ne: 1, sw: -1, se: 1 }; // dx sign that grows the box for this corner
  const widthFromDx = clamp(start.width + sign[corner] * dx, MIN, boundsWidth);
  const widthFromDy = clamp(start.height + (corner === "se" || corner === "sw" ? dy : -dy), MIN, boundsHeight) * ratio;
  let width = Math.abs(dx) >= Math.abs(dy) ? widthFromDx : widthFromDy;

  // Anchor the fixed corner and clamp width so the box never leaves the image.
  const anchorX = corner === "ne" || corner === "se" ? start.x : start.x + start.width;
  const anchorY = corner === "sw" || corner === "se" ? start.y : start.y + start.height;
  const maxWidthByBounds = corner === "ne" || corner === "se" ? boundsWidth - anchorX : anchorX;
  width = clamp(width, MIN, maxWidthByBounds);

  let height = width / ratio;
  const maxHeightByBounds = corner === "sw" || corner === "se" ? boundsHeight - anchorY : anchorY;
  if (height > maxHeightByBounds) {
    height = maxHeightByBounds;
    width = height * ratio;
  }

  const x = corner === "ne" || corner === "se" ? anchorX : anchorX - width;
  const y = corner === "sw" || corner === "se" ? anchorY : anchorY - height;
  return { x, y, width, height };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

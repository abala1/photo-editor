import { useRef, useState, useCallback, useEffect } from "react";
import { CropRect } from "../lib/imageProcessing";

interface Props {
  displayWidth: number;
  displayHeight: number;
  naturalWidth: number;
  naturalHeight: number;
  initialCrop: CropRect | null;
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

  const dragState = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    startRect: typeof rect;
  } | null>(null);

  const emitChange = useCallback(
    (r: typeof rect) => {
      onChange({
        x: Math.round(r.x / scale),
        y: Math.round(r.y / scale),
        width: Math.round(r.width / scale),
        height: Math.round(r.height / scale),
      });
    },
    [onChange, scale]
  );

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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

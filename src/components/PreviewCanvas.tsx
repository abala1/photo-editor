import { useEffect, useRef, useState, CSSProperties } from "react";
import { Adjustments, buildCssFilter } from "../lib/filters";
import { CropRect } from "../lib/imageProcessing";
import CropOverlay from "./CropOverlay";

export type Zoom = "fit" | number;

interface Props {
  imageSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  adjustments: Adjustments;
  extraFilter?: string;
  cropMode: boolean;
  crop: CropRect | null;
  cropAspectRatio: number | null;
  onCropChange: (r: CropRect) => void;
  zoom: Zoom;
}

export default function PreviewCanvas({
  imageSrc,
  naturalWidth,
  naturalHeight,
  adjustments,
  extraFilter,
  cropMode,
  crop,
  cropAspectRatio,
  onCropChange,
  zoom,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const update = () => {
      if (imgRef.current) {
        setDisplaySize({
          width: imgRef.current.clientWidth,
          height: imgRef.current.clientHeight,
        });
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [imageSrc, cropMode, zoom]);

  const rotation = cropMode ? 0 : adjustments.rotation;
  const effectiveZoom = cropMode ? "fit" : zoom;

  const sizeStyle: CSSProperties =
    effectiveZoom === "fit"
      ? { maxWidth: "100%", maxHeight: "70vh" }
      : { width: naturalWidth * effectiveZoom, maxWidth: "none", maxHeight: "none" };

  return (
    <div className={effectiveZoom === "fit" ? "preview-container" : "preview-container zoomed"} ref={containerRef}>
      <div className="preview-inner" style={{ position: "relative" }}>
        <img
          ref={imgRef}
          src={imageSrc}
          alt="preview"
          onLoad={() =>
            imgRef.current &&
            setDisplaySize({
              width: imgRef.current.clientWidth,
              height: imgRef.current.clientHeight,
            })
          }
          style={{
            display: "block",
            ...sizeStyle,
            filter: cropMode ? "none" : buildCssFilter(adjustments, extraFilter),
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transition: "transform 0.15s ease",
          }}
        />
        {cropMode && displaySize.width > 0 && (
          <CropOverlay
            displayWidth={displaySize.width}
            displayHeight={displaySize.height}
            naturalWidth={naturalWidth}
            naturalHeight={naturalHeight}
            initialCrop={crop}
            aspectRatio={cropAspectRatio}
            onChange={onCropChange}
          />
        )}
      </div>
    </div>
  );
}

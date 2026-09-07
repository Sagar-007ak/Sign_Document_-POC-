import { useCallback, useEffect, useRef, useState } from "react";

const MIN_WIDTH_PCT = 0.08;
const MAX_WIDTH_PCT = 0.6;
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

/**
 * FR-03: Position Signature - shows the current page preview and, once a
 * signature exists, a draggable/resizable overlay. Position/size are kept
 * as page fractions (0-1), which is exactly what /api/sign expects.
 */
export default function DocumentCanvas({ page, signatureSrc, placement, onPlacementChange, signedPreview }) {
  const containerRef = useRef(null);
  const dragState = useRef(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const displaySrc = signedPreview ? signedPreview.image_base64 : page.image_base64;

  function onPointerMove(evt) {
    const state = dragState.current;
    if (!state) return;
    if (state.type === "move") {
      const dxPct = (evt.clientX - state.startX) / state.rectWidth;
      const dyPct = (evt.clientY - state.startY) / state.rectHeight;
      onPlacementChange((prev) => ({
        ...prev,
        xPct: clamp(state.startXPct + dxPct, 0, 1 - prev.widthPct),
        yPct: clamp(state.startYPct + dyPct, 0, 0.98),
      }));
    } else {
      const dxPct = (evt.clientX - state.startX) / state.rectWidth;
      onPlacementChange((prev) => ({ ...prev, widthPct: clamp(state.startWidthPct + dxPct, MIN_WIDTH_PCT, MAX_WIDTH_PCT) }));
    }
  }

  function onPointerUp() {
    dragState.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }

  function beginDrag(evt, extra) {
    evt.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = { startX: evt.clientX, startY: evt.clientY, rectWidth: rect.width, rectHeight: rect.height, ...extra };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  const onPointerDownMove = useCallback(
    (evt) => beginDrag(evt, { type: "move", startXPct: placement.xPct, startYPct: placement.yPct }),
    [placement]
  );
  const onPointerDownResize = useCallback(
    (evt) => { evt.stopPropagation(); beginDrag(evt, { type: "resize", startWidthPct: placement.widthPct }); },
    [placement]
  );

  useEffect(() => () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, []);

  return (
    <div className="doc-canvas" ref={containerRef}>
      <img src={displaySrc} alt={`Page ${page.page_number} preview`} className="doc-canvas__page"
        onLoad={() => setImgLoaded(true)} draggable={false} />
      {imgLoaded && signatureSrc && !signedPreview && (
        <div className="doc-canvas__sig" onPointerDown={onPointerDownMove}
          style={{ left: `${placement.xPct * 100}%`, top: `${placement.yPct * 100}%`, width: `${placement.widthPct * 100}%` }}>
          <img src={signatureSrc} alt="Your signature, positioned on the document" draggable={false} />
          <span className="doc-canvas__handle" onPointerDown={onPointerDownResize} aria-label="Resize signature" />
        </div>
      )}
    </div>
  );
}

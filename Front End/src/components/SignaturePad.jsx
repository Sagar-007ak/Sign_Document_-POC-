import { useEffect, useRef, useState } from "react";

/**
 * FR-02: Signature Method - draw with mouse/touch, or upload a signature
 * image. onCreate(dataUrl) hands the finished signature to the parent.
 */
export default function SignaturePad({ onCreate }) {
  const [mode, setMode] = useState("draw");
  const [isEmpty, setIsEmpty] = useState(true);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const drawing = useRef(false);
  const hasStroke = useRef(false);
  const lastPoint = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) Object.assign(ctx, { lineWidth: 2.6, lineCap: "round", lineJoin: "round", strokeStyle: "#17213b" });
  }, [mode]);

  function getPos(evt) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = evt.touches ? evt.touches[0] : evt;
    return { x: ((point.clientX - rect.left) / rect.width) * canvas.width,
             y: ((point.clientY - rect.top) / rect.height) * canvas.height };
  }

  function startDraw(evt) {
    evt.preventDefault();
    drawing.current = hasStroke.current = true;
    lastPoint.current = getPos(evt);
    setIsEmpty(false);
  }

  function moveDraw(evt) {
    if (!drawing.current) return;
    evt.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const point = getPos(evt);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
  }

  const endDraw = () => (drawing.current = false);

  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    hasStroke.current = false;
    setIsEmpty(true);
  }

  const useDrawnSignature = () => hasStroke.current && onCreate(canvasRef.current.toDataURL("image/png"));

  function handleFileUpload(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCreate(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <div className="sig-pad">
      <div className="sig-pad__tabs" role="tablist" aria-label="Signature method">
        {["draw", "upload"].map((m) => (
          <button key={m} role="tab" aria-selected={mode === m}
            className={`sig-pad__tab${mode === m ? " is-active" : ""}`} onClick={() => setMode(m)}>
            {m === "draw" ? "Draw" : "Upload image"}
          </button>
        ))}
      </div>

      {mode === "draw" ? (
        <>
          <canvas ref={canvasRef} width={420} height={160} className="sig-pad__canvas"
            onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
            aria-label="Draw your signature here" />
          <div className="sig-pad__actions">
            <button type="button" className="btn btn--ghost" onClick={clearCanvas}>Clear</button>
            <button type="button" className="btn btn--primary" disabled={isEmpty} onClick={useDrawnSignature}>
              Use this signature
            </button>
          </div>
        </>
      ) : (
        <div className="sig-pad__upload">
          <p className="sig-pad__hint">Upload a photo or scan of your signature (PNG or JPG, transparent background works best).</p>
          <button type="button" className="btn btn--primary" onClick={() => fileInputRef.current?.click()}>
            Choose image
          </button>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" onChange={handleFileUpload} hidden />
        </div>
      )}
    </div>
  );
}

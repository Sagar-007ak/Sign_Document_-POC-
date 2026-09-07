import { useRef, useState } from "react";

/** FR-01: Upload Document */
export default function UploadStep({ onUpload, isUploading, error }) {
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = (fileList) => fileList?.[0] && onUpload(fileList[0]);

  return (
    <div className="upload-step">
      <div
        className={`dropzone${isDragOver ? " is-drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 16V4M12 4L7 9M12 4L17 9" stroke="#17213b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16V18.5C4 19.3284 4.67157 20 5.5 20H18.5C19.3284 20 20 19.3284 20 18.5V16" stroke="#17213b" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <p className="dropzone__title">{isUploading ? "Uploading…" : "Drop a document here, or click to choose a file"}</p>
        <p className="dropzone__hint">PDF or DOCX, up to 5MB</p>
        <input ref={inputRef} type="file" accept=".pdf,.docx" hidden onChange={(e) => handleFiles(e.target.files)} />
      </div>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

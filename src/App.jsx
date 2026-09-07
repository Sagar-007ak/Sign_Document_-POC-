import { useMemo, useState } from "react";
import UploadStep from "./components/UploadStep.jsx";
import SignaturePad from "./components/SignaturePad.jsx";
import DocumentCanvas from "./components/DocumentCanvas.jsx";
import { uploadDocument, signDocument, downloadUrl } from "./api.js";
import "./App.css";

const STEPS = ["Upload", "Add signature", "Position & sign", "Download"];

export default function App() {
  const [doc, setDoc] = useState(null); // { doc_id, filename, page_count, pages }
  const [currentPage, setCurrentPage] = useState(1);
  const [signatureSrc, setSignatureSrc] = useState(null);
  const [placement, setPlacement] = useState({ xPct: 0.58, yPct: 0.82, widthPct: 0.24 });
  const [isUploading, setIsUploading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [signedResult, setSignedResult] = useState(null); // { downloadUrl, preview }
  const [error, setError] = useState(null);

  const activeStep = useMemo(() => {
    if (!doc) return 0;
    if (signedResult) return 3;
    return signatureSrc ? 2 : 1;
  }, [doc, signatureSrc, signedResult]);

  async function handleUpload(file) {
    setError(null);
    setIsUploading(true);
    try {
      setDoc(await uploadDocument(file));
      setCurrentPage(1);
      setSignatureSrc(null);
      setSignedResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSign() {
    if (!doc || !signatureSrc) return;
    setError(null);
    setIsSigning(true);
    try {
      setSignedResult(await signDocument({
        docId: doc.doc_id, signatureImage: signatureSrc, pageNumber: currentPage,
        xPct: placement.xPct, yPct: placement.yPct, widthPct: placement.widthPct,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSigning(false);
    }
  }

  function handleStartOver() {
    setDoc(null);
    setSignatureSrc(null);
    setSignedResult(null);
    setError(null);
    setCurrentPage(1);
  }

  const currentPageData = doc?.pages?.find((p) => p.page_number === currentPage);

  return (
    <div className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 18C6 15 8 20 10 17C12 14 14 19 16 16C18 13 19 15 20 14" stroke="#a4402c" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M5 6H15L19 10V19.5C19 20.3284 18.3284 21 17.5 21H5.5C4.67157 21 4 20.3284 4 19.5V6.5C4 5.67157 4.67157 5 5.5 5" stroke="#17213b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="brand__name">Signet</span>
        </div>
        <p className="brand__tagline">Sign documents in your browser — nothing leaves your session until you export.</p>
      </header>

      <div className="app__body">
        <aside className="rail">
          <ol className="steps">
            {STEPS.map((label, i) => (
              <li key={label} className={`steps__item${i === activeStep ? " is-active" : i < activeStep ? " is-done" : ""}`}>
                <span className="steps__index">{i + 1}</span>
                <span className="steps__label">{label}</span>
              </li>
            ))}
          </ol>

          {doc && (
            <div className="doc-meta">
              <h3>{doc.filename}</h3>
              <p>{doc.page_count} page{doc.page_count > 1 ? "s" : ""}</p>
              {doc.page_count > 1 && (
                <div className="page-nav">
                  {doc.pages.map((p) => (
                    <button key={p.page_number} disabled={!!signedResult}
                      className={`page-nav__btn${p.page_number === currentPage ? " is-active" : ""}`}
                      onClick={() => setCurrentPage(p.page_number)}>
                      {p.page_number}
                    </button>
                  ))}
                </div>
              )}
              <button className="btn btn--ghost btn--small" onClick={handleStartOver}>Start over</button>
            </div>
          )}
        </aside>

        <main className="stage">
          {error && <div className="banner banner--error">{error}</div>}

          {!doc && <UploadStep onUpload={handleUpload} isUploading={isUploading} error={null} />}

          {doc && currentPageData && (
            <div className="sign-workspace">
              <div className="sign-workspace__preview">
                <DocumentCanvas
                  page={currentPageData}
                  signatureSrc={signatureSrc}
                  placement={placement}
                  onPlacementChange={setPlacement}
                  signedPreview={signedResult?.preview?.page_number === currentPage ? signedResult.preview : null}
                />
                {signatureSrc && !signedResult && (
                  <p className="sign-workspace__hint">Drag the signature to position it, use the corner handle to resize.</p>
                )}
              </div>

              <div className="sign-workspace__side">
                {!signedResult && !signatureSrc && (
                  <div className="panel">
                    <h2>Add your signature</h2>
                    <SignaturePad onCreate={setSignatureSrc} />
                  </div>
                )}

                {!signedResult && signatureSrc && (
                  <div className="panel">
                    <h2>Ready to place</h2>
                    <p className="panel__hint">Your signature is on the document. Drag it into place, then confirm.</p>
                    <img className="sig-preview" src={signatureSrc} alt="Your saved signature" />
                    <div className="panel__actions">
                      <button className="btn btn--ghost" onClick={() => setSignatureSrc(null)}>Redo signature</button>
                      <button className="btn btn--primary" onClick={handleSign} disabled={isSigning}>
                        {isSigning ? "Signing…" : "Place & sign document"}
                      </button>
                    </div>
                  </div>
                )}

                {signedResult && (
                  <div className="panel panel--success">
                    <h2>Document signed</h2>
                    <p className="panel__hint">Your signature has been embedded into the document. The original content was not altered.</p>
                    <a className="btn btn--primary" href={downloadUrl(doc.doc_id)} download>Download signed PDF</a>
                    <button className="btn btn--ghost btn--small" onClick={handleStartOver}>Sign another document</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

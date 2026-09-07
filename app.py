"""Sign Document POC - Backend (Flask API: upload, preview, sign, download)."""
import base64, io, os, uuid
from datetime import datetime, timezone

import pymupdf as fitz
from flask import Flask, jsonify, request, send_file, abort
from flask_cors import CORS
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR, SIGNED_DIR = (os.path.join(BASE_DIR, d) for d in ("uploads", "signed"))
for d in (UPLOAD_DIR, SIGNED_DIR):
    os.makedirs(d, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "docx"}
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024  # 10MB safety cap
CORS(app)

DOCUMENTS = {}  # doc_id -> record (in-memory registry, fine for a POC)


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def docx_to_pdf_bytes(docx_path):
    """Lightweight DOCX -> PDF: lays out paragraph text/tables via reportlab.
    Does not preserve rich formatting; use LibreOffice headless for that."""
    from docx import Document
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet

    styles = getSampleStyleSheet()
    story = []
    for para in Document(docx_path).paragraphs:
        text = para.text.strip()
        if not text:
            story.append(Spacer(1, 8))
            continue
        style = styles["Heading2"] if "Heading" in (para.style.name or "") else styles["Normal"]
        safe = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        story += [Paragraph(safe, style), Spacer(1, 4)]

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=letter).build(story or [Paragraph("(Empty document)", styles["Normal"])])
    return buf.getvalue()


def get_doc_record(doc_id):
    record = DOCUMENTS.get(doc_id)
    if not record:
        abort(404, description="Document not found. Upload it again.")
    return record


def render_page_previews(pdf_path, max_pages=20, zoom=1.5):
    """Render each PDF page to a base64 PNG for the frontend preview."""
    previews = []
    pdf_doc = fitz.open(pdf_path)
    matrix = fitz.Matrix(zoom, zoom)
    for i, page in enumerate(pdf_doc):
        if i >= max_pages:
            break
        pix = page.get_pixmap(matrix=matrix)
        b64 = base64.b64encode(pix.tobytes("png")).decode("utf-8")
        previews.append({"page_number": i + 1, "width": pix.width, "height": pix.height,
                          "image_base64": f"data:image/png;base64,{b64}"})
    page_count = pdf_doc.page_count
    pdf_doc.close()
    return previews, page_count


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "time": datetime.now(timezone.utc).isoformat()})


@app.post("/api/upload")
def upload_document():
    """FR-01: accepts multipart 'file' (.pdf/.docx), returns doc_id + page previews."""
    file = request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Unsupported file type. Please upload a PDF or DOCX."}), 400

    doc_id = uuid.uuid4().hex
    ext = file.filename.rsplit(".", 1)[1].lower()
    saved_path = os.path.join(UPLOAD_DIR, f"{doc_id}_{secure_filename(file.filename)}")
    file.save(saved_path)

    working_pdf_path = saved_path
    if ext == "docx":
        try:
            working_pdf_path = os.path.join(UPLOAD_DIR, f"{doc_id}_converted.pdf")
            with open(working_pdf_path, "wb") as f:
                f.write(docx_to_pdf_bytes(saved_path))
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": f"Could not convert DOCX to PDF: {exc}"}), 500

    try:
        previews, page_count = render_page_previews(working_pdf_path)
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Could not render document preview: {exc}"}), 500

    DOCUMENTS[doc_id] = {
        "original_filename": file.filename, "original_ext": ext, "original_path": saved_path,
        "working_pdf_path": working_pdf_path, "page_count": page_count,
        "uploaded_at": datetime.now(timezone.utc).isoformat(), "signed_path": None,
    }
    return jsonify({"doc_id": doc_id, "filename": file.filename, "page_count": page_count, "pages": previews})


@app.post("/api/sign")
def sign_document():
    """FR-02/FR-03: embeds a signature image at (page_number, x_pct, y_pct, width_pct).
    Fractions of the page size so the payload is zoom-independent."""
    data = request.get_json(silent=True) or {}
    doc_id, sig_image = data.get("doc_id"), data.get("signature_image")
    page_number, x_pct, y_pct = data.get("page_number"), data.get("x_pct"), data.get("y_pct")
    width_pct = data.get("width_pct", 0.25)

    if not all([doc_id, sig_image, page_number is not None, x_pct is not None, y_pct is not None]):
        return jsonify({"error": "doc_id, signature_image, page_number, x_pct and y_pct are required"}), 400

    record = get_doc_record(doc_id)
    if not (0 <= x_pct <= 1 and 0 <= y_pct <= 1):
        return jsonify({"error": "x_pct and y_pct must be between 0 and 1"}), 400
    if not (0 < width_pct <= 1):
        return jsonify({"error": "width_pct must be between 0 and 1"}), 400
    if not (1 <= page_number <= record["page_count"]):
        return jsonify({"error": f"page_number must be between 1 and {record['page_count']}"}), 400

    try:
        _, encoded = sig_image.split(",", 1) if "," in sig_image else ("", sig_image)
        sig_bytes = base64.b64decode(encoded)
    except Exception:
        return jsonify({"error": "signature_image must be a valid base64 data URL"}), 400

    try:
        pdf_doc = fitz.open(record["working_pdf_path"])
        page = pdf_doc[page_number - 1]
        page_rect = page.rect

        sig_width_pt = page_rect.width * width_pct
        sig_img = fitz.Pixmap(sig_bytes)
        aspect = sig_img.height / sig_img.width if sig_img.width else 0.4
        sig_height_pt = sig_width_pt * aspect

        x0, y0 = page_rect.width * x_pct, page_rect.height * y_pct
        rect = fitz.Rect(x0, y0, x0 + sig_width_pt, y0 + sig_height_pt)
        # New image XObject only - the page's existing content stream is untouched.
        page.insert_image(rect, stream=sig_bytes, keep_proportion=True, overlay=True)

        signed_path = os.path.join(SIGNED_DIR, f"signed_{uuid.uuid4().hex}.pdf")
        pdf_doc.save(signed_path)
        pdf_doc.close()
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Failed to embed signature: {exc}"}), 500

    record["signed_path"] = signed_path
    record["signed_at"] = datetime.now(timezone.utc).isoformat()
    previews, _ = render_page_previews(signed_path)

    return jsonify({"doc_id": doc_id, "signed": True, "download_url": f"/api/download/{doc_id}",
                     "preview": previews[page_number - 1]})


@app.get("/api/download/<doc_id>")
def download_signed(doc_id):
    """FR-04: download the signed document."""
    record = get_doc_record(doc_id)
    if not record.get("signed_path") or not os.path.exists(record["signed_path"]):
        return jsonify({"error": "Document has not been signed yet."}), 400
    base_name = os.path.splitext(record["original_filename"])[0]
    return send_file(record["signed_path"], as_attachment=True, download_name=f"{base_name}_signed.pdf")


@app.get("/api/document/<doc_id>")
def get_document(doc_id):
    """Metadata + previews for a document (e.g. after a page refresh)."""
    record = get_doc_record(doc_id)
    previews, page_count = render_page_previews(record["working_pdf_path"])
    return jsonify({"doc_id": doc_id, "filename": record["original_filename"], "page_count": page_count,
                     "pages": previews, "signed": bool(record.get("signed_path"))})


if __name__ == "__main__":
    app.run(debug=True, port=5000)

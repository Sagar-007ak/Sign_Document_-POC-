const API_BASE = "/api";

async function handle(res) {
  if (res.ok) return res.json();
  const body = await res.json().catch(() => ({}));
  throw new Error(body.error || `Request failed (${res.status})`);
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);
  return handle(await fetch(`${API_BASE}/upload`, { method: "POST", body: formData }));
}

export async function signDocument({ docId, signatureImage, pageNumber, xPct, yPct, widthPct }) {
  return handle(await fetch(`${API_BASE}/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc_id: docId, signature_image: signatureImage, page_number: pageNumber,
      x_pct: xPct, y_pct: yPct, width_pct: widthPct,
    }),
  }));
}

export const downloadUrl = (docId) => `${API_BASE}/download/${docId}`;

// Thin wrapper around the backend REST API.
// Override the backend URL at build time with VITE_API_URL if it is not on localhost:8000.
export const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

function errorMessage(data, status) {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    // FastAPI validation errors: [{loc: [...], msg: "..."}]
    return d.map((x) => `${(x.loc || []).slice(-1)[0]}: ${x.msg}`).join("; ");
  }
  return `Request failed (${status})`;
}

async function request(path, options) {
  let res;
  try {
    res = await fetch(`${API}${path}`, options);
  } catch {
    throw new Error(`Cannot reach the backend at ${API}. Is it running?`);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no JSON body */
  }
  if (!res.ok) throw new Error(errorMessage(data, res.status));
  return data;
}

const postJson = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function excelForm(file, mapping) {
  const form = new FormData();
  form.append("file", file);
  if (mapping) {
    form.append("id_column", mapping.id_column);
    form.append("type_column", mapping.type_column);
  }
  return { method: "POST", body: form };
}

export const api = {
  health: () => request("/api/health"),

  // Option 1: Excel upload
  inspectExcel: (file) => request("/api/excel/inspect", excelForm(file)),
  processExcel: (file, mapping) => request("/api/excel/process", excelForm(file, mapping)),

  // Option 2: MySQL table
  inspectMysql: (conn) => request("/api/mysql/inspect", postJson(conn)),
  processMysql: (conn, mapping) => request("/api/mysql/process", postJson({ ...conn, ...mapping })),

  // Stored jobs
  listJobs: () => request("/api/jobs"),
  getJob: (id) => request(`/api/jobs/${id}`),
  jobRows: (id, params) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== "" && v !== null && v !== undefined)
    );
    return request(`/api/jobs/${id}/rows?${qs}`);
  },
  deleteJob: (id) => request(`/api/jobs/${id}`, { method: "DELETE" }),
  downloadUrl: (id) => `${API}/api/jobs/${id}/download`,
};

export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : "");
export const fmtNum = (n) => (n ?? 0).toLocaleString();

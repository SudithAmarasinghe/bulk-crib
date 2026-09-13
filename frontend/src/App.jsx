import { useState, useRef } from "react";

const API = "http://localhost:8000";

export default function App() {
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("summary");
  const inputRef = useRef();

  const reset = () => { setAnalysis(null); setResult(null); setError(""); };

  const handleFile = async (f) => {
    if (!f) return;
    reset();
    setFile(f);
    setLoading("Analyzing file...");
    const form = new FormData();
    form.append("file", f);
    try {
      const res = await fetch(`${API}/api/analyze`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Analysis failed");
      setAnalysis(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading("");
    }
  };

  const processFile = async () => {
    setLoading("Processing... this may take a few minutes for large files");
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${API}/api/process`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Processing failed");
      setResult(data);
      setTab("summary");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading("");
    }
  };

  const download = () => {
    window.location.href = `${API}/api/download/${result.job_id}`;
  };

  const s = result?.summary;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>📊 Excel ID Processor</h1>
        <p style={styles.subtitle}>By AI & Data Science Unit — Commercial Bank of Ceylon</p>

        {/* Upload zone */}
        <div
          style={styles.dropzone}
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden
                 onChange={(e) => handleFile(e.target.files[0])} />
          <div style={{ fontSize: 40 }}>📁</div>
          <div><b>{file ? file.name : "Click or drag an Excel file here"}</b></div>
          <div style={{ color: "#888", fontSize: 13 }}>Requires columns: ID_NUMBER, PERSONAL_NONPERSONAL</div>
        </div>

        {loading && <div style={styles.loading}>⏳ {loading}</div>}
        {error && <div style={styles.error}>❌ {error}</div>}

        {/* Analysis panel */}
        {analysis && !result && (
          <div style={styles.card}>
            <h3>File Analysis</h3>
            <div style={styles.statRow}>
              <Stat label="Rows" value={analysis.total_rows.toLocaleString()} />
              <Stat label="Columns" value={analysis.columns.length} />
              <Stat label="Required Columns"
                    value={analysis.required_columns_present ? "✅ Present" : "❌ Missing"} />
            </div>
            {analysis.required_columns_present ? (
              <>
                <table style={styles.table}>
                  <thead><tr><th style={styles.th}>ID_NUMBER</th><th style={styles.th}>Type</th></tr></thead>
                  <tbody>
                    {analysis.preview.map((r, i) => (
                      <tr key={i}>
                        <td style={styles.td}>{r.ID_NUMBER}</td>
                        <td style={styles.td}>{r.PERSONAL_NONPERSONAL}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button style={styles.primaryBtn} onClick={processFile} disabled={!!loading}>
                  🔄 Process File
                </button>
              </>
            ) : (
              <div style={styles.error}>Missing columns: {analysis.missing_columns.join(", ")}</div>
            )}
          </div>
        )}

        {/* Results dashboard */}
        {s && (
          <div style={styles.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>✅ Processing Complete</h3>
              <button style={styles.primaryBtn} onClick={download}>⬇️ Download ZIP</button>
            </div>

            {/* Tabs */}
            <div style={styles.tabs}>
              {["summary", "comparison", "changes", "duplicates"].map((t) => (
                <button key={t}
                        style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
                        onClick={() => setTab(t)}>
                  {t === "changes" ? `Changed IDs (${s.comparison.ids_changed})`
                    : t === "duplicates" ? `Duplicates (${s.duplicates.duplicate_record_count})`
                    : t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {tab === "summary" && (
              <div style={styles.statRow}>
                <Stat label="Uploaded" value={s.input.total_uploaded.toLocaleString()} />
                <Stat label="Valid" value={s.input.valid_records.toLocaleString()} />
                <Stat label="Corporate" value={s.output.corporate_records.toLocaleString()} />
                <Stat label="Consumer" value={s.output.consumer_records.toLocaleString()} />
                <Stat label="NIC" value={s.output.nic_count.toLocaleString()} />
                <Stat label="Passport" value={s.output.passport_count.toLocaleString()} />
                <Stat label="Output Files" value={s.output.total_files} />
              </div>
            )}

            {tab === "comparison" && (
              <div>
                <div style={styles.statRow}>
                  <Stat label="Records In" value={s.input.total_uploaded.toLocaleString()} />
                  <Stat label="Records Out" value={s.output.total_output_records.toLocaleString()} />
                  <Stat label="Dropped" value={s.comparison.records_dropped}
                        warn={s.comparison.records_dropped > 0} />
                  <Stat label="IDs Modified" value={s.comparison.ids_changed} />
                  <Stat label="Change Rate" value={`${s.comparison.change_rate_percent}%`} />
                </div>
                <div style={s.comparison.records_match ? styles.okBanner : styles.warnBanner}>
                  {s.comparison.records_match
                    ? "✅ Reconciled: every valid uploaded record appears in the output."
                    : `⚠️ ${s.comparison.records_dropped} record(s) were dropped — ${s.input.empty_removed} empty ID(s), ${s.input.invalid_type_removed} invalid type value(s).`}
                </div>
              </div>
            )}

            {tab === "changes" && (
              s.changes.length === 0 ? <p>No ID numbers were modified. 🎉</p> :
              <>
                {s.changes_truncated && <p style={{ color: "#996600" }}>Showing first 500 changes. Full list is in the ZIP.</p>}
                <table style={styles.table}>
                  <thead><tr>
                    <th style={styles.th}>Original</th><th style={styles.th}>Cleaned</th><th style={styles.th}>Type</th>
                  </tr></thead>
                  <tbody>
                    {s.changes.map((c, i) => (
                      <tr key={i}>
                        <td style={{ ...styles.td, color: "#c00" }}>{c.original}</td>
                        <td style={{ ...styles.td, color: "#080" }}>{c.cleaned}</td>
                        <td style={styles.td}>{c.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {tab === "duplicates" && (
              s.duplicates.duplicate_record_count === 0 ? <p>No duplicate IDs found. 🎉</p> :
              <>
                <div style={styles.warnBanner}>
                  ⚠️ {s.duplicates.duplicate_record_count} records share {s.duplicates.unique_duplicate_ids.length}+ duplicate cleaned ID(s). Review before submitting.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {s.duplicates.unique_duplicate_ids.map((id) => (
                    <span key={id} style={styles.pill}>{id}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }) {
  return (
    <div style={{ ...styles.stat, ...(warn ? { borderColor: "#e6a700", background: "#fff8e6" } : {}) }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#f4f6f8", fontFamily: "Segoe UI, sans-serif", padding: 24 },
  container: { maxWidth: 900, margin: "0 auto" },
  title: { textAlign: "center", marginBottom: 0 },
  subtitle: { textAlign: "center", color: "#777", marginTop: 4 },
  dropzone: { background: "#fff", border: "2px dashed #aac", borderRadius: 12, padding: 32,
              textAlign: "center", cursor: "pointer", marginBottom: 16 },
  card: { background: "#fff", borderRadius: 12, padding: 20, marginBottom: 16,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  statRow: { display: "flex", flexWrap: "wrap", gap: 10, margin: "12px 0" },
  stat: { flex: "1 1 110px", background: "#f8fafc", border: "1px solid #e2e8f0",
          borderRadius: 10, padding: 12, textAlign: "center" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 14 },
  th: { textAlign: "left", padding: 8, borderBottom: "2px solid #ddd", background: "#f8fafc" },
  td: { padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace" },
  primaryBtn: { background: "#1a56db", color: "#fff", border: 0, borderRadius: 8,
                padding: "10px 22px", fontSize: 15, cursor: "pointer", marginTop: 10 },
  tabs: { display: "flex", gap: 6, margin: "14px 0", flexWrap: "wrap" },
  tab: { border: "1px solid #ddd", background: "#fff", borderRadius: 20,
         padding: "6px 14px", cursor: "pointer", fontSize: 13 },
  tabActive: { background: "#1a56db", color: "#fff", borderColor: "#1a56db" },
  loading: { background: "#eef4ff", padding: 12, borderRadius: 8, marginBottom: 12 },
  error: { background: "#fee", color: "#900", padding: 12, borderRadius: 8, marginBottom: 12 },
  okBanner: { background: "#eafbea", color: "#166534", padding: 12, borderRadius: 8, marginTop: 8 },
  warnBanner: { background: "#fff8e6", color: "#92600a", padding: 12, borderRadius: 8, marginTop: 8 },
  pill: { background: "#fee", color: "#900", padding: "4px 10px", borderRadius: 12,
          fontSize: 12, fontFamily: "monospace" },
};
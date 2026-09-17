import { useEffect, useState } from "react";
import { styles } from "../styles";
import { api, fmtDate, fmtNum } from "../api";

export default function History({ onOpen }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = async () => {
    setError("");
    try {
      setData(await api.listJobs());
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (job) => {
    const ok = window.confirm(
      `Delete the job processed on ${fmtDate(job.created_at)} from ${job.source.label}?\n` +
        "Its results and ZIP file will be removed permanently."
    );
    if (!ok) return;
    setBusy(job.job_id);
    try {
      await api.deleteJob(job.job_id);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const jobs = data?.jobs || [];

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <div>
          <h3 style={styles.h3}>🕘 Processed jobs</h3>
          <div style={styles.muted}>
            Every job is kept for {data?.retention_days ?? "…"} days after processing and then deleted automatically.
            Open a job to review its ID changes again or download its ZIP.
          </div>
        </div>
        <button style={styles.secondaryBtn} onClick={load}>↻ Refresh</button>
      </div>

      {error && <div style={{ ...styles.error, marginTop: 12 }}>❌ {error}</div>}
      {!data && !error && <div style={styles.loading}>⏳ Loading…</div>}
      {data && jobs.length === 0 && <div style={styles.empty}>No jobs stored yet.</div>}

      {jobs.length > 0 && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Processed</th>
                <th style={styles.th}>Source</th>
                <th style={styles.th}>Mapping (ID · type)</th>
                <th style={styles.th}>Rows in → out</th>
                <th style={styles.th}>Changed</th>
                <th style={styles.th}>Expires</th>
                <th style={styles.th}></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.job_id}>
                  <td style={styles.tdText}>{fmtDate(j.created_at)}</td>
                  <td style={styles.tdText}>{j.source.type === "excel" ? "📁" : "🗄️"} {j.source.label}</td>
                  <td style={styles.td}>{j.mapping.id_column} · {j.mapping.type_column}</td>
                  <td style={styles.td}>
                    {fmtNum(j.summary.input.total_uploaded)} → {fmtNum(j.summary.output.total_output_records)}
                  </td>
                  <td style={styles.td}>{fmtNum(j.summary.comparison.ids_changed)}</td>
                  <td style={styles.tdText}>{fmtDate(j.expires_at)}</td>
                  <td style={{ ...styles.tdText, whiteSpace: "nowrap" }}>
                    <button style={styles.smallBtn} onClick={() => onOpen(j.job_id)}>View</button>{" "}
                    <a style={styles.smallBtnLink} href={api.downloadUrl(j.job_id)}>ZIP</a>{" "}
                    <button style={styles.dangerBtn} disabled={busy === j.job_id} onClick={() => remove(j)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

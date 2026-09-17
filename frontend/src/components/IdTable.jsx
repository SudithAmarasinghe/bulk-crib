import { useEffect, useState } from "react";
import { styles } from "../styles";
import { Badge } from "./ui";
import { api, fmtNum } from "../api";

const STATUS = {
  ok: ["Kept", "green"],
  empty_id: ["Dropped · empty ID", "grey"],
  invalid_type: ["Dropped · invalid type", "amber"],
};
const TYPE = { P: "Personal", N: "Corporate" };

// Paginated per-row view of a job: every source ID with its cleaned value,
// switchable between all rows and only the rows whose ID changed.
export default function IdTable({ jobId, summary }) {
  const changedCount = summary.comparison.ids_changed;
  const [view, setView] = useState(changedCount > 0 ? "changed" : "all");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const applyFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const d = await api.jobRows(jobId, {
          view,
          status: view === "changed" ? "" : status,
          search,
          page,
          page_size: pageSize,
        });
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, view, status, search, page, pageSize]);

  const rows = data?.rows || [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(page * pageSize, total);

  return (
    <div>
      <div style={styles.controls}>
        <div style={styles.toggleGroup}>
          <button style={{ ...styles.toggle, ...(view === "all" ? styles.toggleActive : {}) }}
                  onClick={() => applyFilter(setView)("all")}>
            All IDs ({fmtNum(summary.input.total_uploaded)})
          </button>
          <button style={{ ...styles.toggle, ...(view === "changed" ? styles.toggleActive : {}) }}
                  onClick={() => applyFilter(setView)("changed")}>
            Changed only ({fmtNum(changedCount)})
          </button>
        </div>

        {view === "all" && (
          <select style={{ ...styles.select, width: "auto" }} value={status}
                  onChange={(e) => applyFilter(setStatus)(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ok">Kept</option>
            <option value="empty_id">Dropped · empty ID</option>
            <option value="invalid_type">Dropped · invalid type</option>
          </select>
        )}

        <input style={{ ...styles.input, width: 220 }} placeholder="🔍 Search original or cleaned ID"
               value={search} onChange={(e) => applyFilter(setSearch)(e.target.value)} />

        <select style={{ ...styles.select, width: "auto" }} value={pageSize}
                onChange={(e) => applyFilter(setPageSize)(Number(e.target.value))}>
          {[50, 100, 250, 500, 1000].map((n) => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </select>
      </div>

      {error && <div style={styles.error}>❌ {error}</div>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Original ID</th>
              <th style={styles.th}>Cleaned ID</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>ID type</th>
              <th style={styles.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const [label, tone] = STATUS[r.status] || [r.status, "grey"];
              const changed = r.changed === 1;
              return (
                <tr key={r.row_no} style={changed ? styles.trChanged : undefined}>
                  <td style={styles.tdMuted}>{fmtNum(r.row_no)}</td>
                  <td style={{ ...styles.td, color: changed ? "#c00" : undefined }}>
                    {r.original_id || <i style={styles.muted}>empty</i>}
                  </td>
                  <td style={{ ...styles.td, color: changed ? "#080" : undefined, fontWeight: changed ? 600 : 400 }}>
                    {r.status === "ok" ? r.cleaned_id : "—"}
                    {changed && <Badge tone="blue">changed</Badge>}
                    {r.duplicate === 1 && <Badge tone="red">duplicate</Badge>}
                  </td>
                  <td style={styles.tdText}>{TYPE[r.record_type] || r.record_type || "—"}</td>
                  <td style={styles.tdText}>{r.id_type || "—"}</td>
                  <td style={styles.tdText}><Badge tone={tone}>{label}</Badge></td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={styles.empty}>
                  {view === "changed" && !search ? "No ID numbers were modified. 🎉" : "No rows match this filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={styles.pager}>
        <span style={styles.muted}>
          {loading ? "Loading…" : `Showing ${fmtNum(from)}–${fmtNum(to)} of ${fmtNum(total)} rows`}
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button style={styles.smallBtn} disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>‹ Prev</button>
          <span style={styles.muted}>Page {page} of {pages}</span>
          <button style={styles.smallBtn} disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>Next ›</button>
        </div>
      </div>
    </div>
  );
}

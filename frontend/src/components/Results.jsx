import { useState } from "react";
import { styles } from "../styles";
import { Stat } from "./ui";
import IdTable from "./IdTable";
import { api, fmtDate, fmtNum } from "../api";

export default function Results({ job, onNew }) {
  const [tab, setTab] = useState("summary");
  const s = job.summary;

  const tabs = [
    ["summary", "Summary"],
    ["comparison", "Comparison"],
    ["ids", `ID changes (${fmtNum(s.comparison.ids_changed)} of ${fmtNum(s.input.valid_records)})`],
    ["duplicates", `Duplicates (${fmtNum(s.duplicates.duplicate_record_count)})`],
  ];

  return (
    <div style={styles.card}>
      <div style={styles.headerRow}>
        <div>
          <h3 style={styles.h3}>✅ Processing complete</h3>
          <div style={styles.muted}>
            {job.source.type === "excel" ? "📁" : "🗄️"} {job.source.label}
            {" · "}
            <code>{job.mapping.id_column}</code> → ID_NUMBER, <code>{job.mapping.type_column}</code> → PERSONAL_NONPERSONAL
          </div>
          <div style={styles.muted}>
            Processed {fmtDate(job.created_at)} · stored until {fmtDate(job.expires_at)} · job {job.job_id}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href={api.downloadUrl(job.job_id)} style={styles.primaryBtnLink}>⬇️ Download ZIP</a>
          <button style={styles.secondaryBtn} onClick={onNew}>➕ New job</button>
        </div>
      </div>

      <div style={styles.tabs}>
        {tabs.map(([key, label]) => (
          <button key={key} style={{ ...styles.tab, ...(tab === key ? styles.tabActive : {}) }} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <>
          <div style={styles.statRow}>
            <Stat label="Source rows" value={fmtNum(s.input.total_uploaded)} />
            <Stat label="Valid" value={fmtNum(s.input.valid_records)} />
            <Stat label="Corporate" value={fmtNum(s.output.corporate_records)} />
            <Stat label="Consumer" value={fmtNum(s.output.consumer_records)} />
            <Stat label="NIC" value={fmtNum(s.output.nic_count)} />
            <Stat label="Passport" value={fmtNum(s.output.passport_count)} />
            <Stat label="Output files" value={s.output.total_files} />
          </div>
          <p style={styles.muted}>Files in the ZIP:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {job.file_list.map((f) => (
              <span key={f} style={styles.filePill}>{f}</span>
            ))}
          </div>
        </>
      )}

      {tab === "comparison" && (
        <div>
          <div style={styles.statRow}>
            <Stat label="Records in" value={fmtNum(s.input.total_uploaded)} />
            <Stat label="Records out" value={fmtNum(s.output.total_output_records)} />
            <Stat label="Dropped" value={fmtNum(s.comparison.records_dropped)} warn={s.comparison.records_dropped > 0} />
            <Stat label="IDs modified" value={fmtNum(s.comparison.ids_changed)} />
            <Stat label="IDs unchanged" value={fmtNum(s.comparison.ids_unchanged)} />
            <Stat label="Change rate" value={`${s.comparison.change_rate_percent}%`} />
          </div>
          <div style={s.comparison.records_match ? styles.okBanner : styles.warnBanner}>
            {s.comparison.records_match
              ? "✅ Reconciled: every valid source record appears in the output."
              : `⚠️ ${fmtNum(s.comparison.records_dropped)} record(s) were dropped — ${fmtNum(s.input.empty_removed)} empty ID(s), ${fmtNum(s.input.invalid_type_removed)} invalid type value(s). See the ID changes tab with status filter for the exact rows.`}
          </div>
        </div>
      )}

      {tab === "ids" && <IdTable jobId={job.job_id} summary={s} />}

      {tab === "duplicates" &&
        (s.duplicates.duplicate_record_count === 0 ? (
          <p>No duplicate IDs found. 🎉</p>
        ) : (
          <>
            <div style={styles.warnBanner}>
              ⚠️ {fmtNum(s.duplicates.duplicate_record_count)} records share {fmtNum(s.duplicates.unique_duplicate_id_count)}{" "}
              duplicate cleaned ID(s). Review before submitting.
              {s.duplicates.unique_duplicate_id_count > s.duplicates.unique_duplicate_ids.length &&
                ` Showing the first ${s.duplicates.unique_duplicate_ids.length}; use the ID changes tab to search for the rest.`}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {s.duplicates.unique_duplicate_ids.map((id) => (
                <span key={id} style={styles.pill}>{id}</span>
              ))}
            </div>
          </>
        ))}
    </div>
  );
}

import { useState } from "react";
import { styles } from "../styles";
import { Stat, Field } from "./ui";
import { fmtNum } from "../api";

export default function MappingPreview({ inspection, mapping, onMapping, onProcess, disabled }) {
  const [mappedOnly, setMappedOnly] = useState(false);
  const { columns, total_rows, preview, source } = inspection;

  const same = !!mapping.id_column && mapping.id_column === mapping.type_column;
  const ready = !!mapping.id_column && !!mapping.type_column && !same;
  const shownColumns = mappedOnly && ready ? [mapping.id_column, mapping.type_column] : columns;

  const roleOf = (c) =>
    c === mapping.id_column ? "ID_NUMBER" : c === mapping.type_column ? "PERSONAL_NONPERSONAL" : null;

  const select = (key) => (
    <select style={styles.select} value={mapping[key]} onChange={(e) => onMapping({ ...mapping, [key]: e.target.value })}>
      <option value="">— choose a column —</option>
      {columns.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );

  return (
    <div style={styles.card}>
      <h3 style={styles.h3}>2. Map columns and preview the data</h3>

      <div style={styles.statRow}>
        <Stat label="Source" value={source.type === "excel" ? "📁 Excel" : "🗄️ MySQL"} />
        <Stat label="Rows" value={fmtNum(total_rows)} />
        <Stat label="Columns" value={columns.length} />
        <Stat label="Mapping" value={ready ? "✅ Ready" : "⚠️ Incomplete"} warn={!ready} />
      </div>

      <div style={styles.formGrid}>
        <Field label="Source column for ID_NUMBER">{select("id_column")}</Field>
        <Field label="Source column for PERSONAL_NONPERSONAL (values P / N)">{select("type_column")}</Field>
      </div>
      {same && <div style={{ ...styles.error, marginTop: 10 }}>❌ Choose two different columns.</div>}

      <div style={{ ...styles.headerRow, alignItems: "center", marginTop: 14 }}>
        <span style={styles.muted}>
          Preview of the first {preview.length} of {fmtNum(total_rows)} rows. Highlighted columns are the ones that
          will be processed.
        </span>
        <label style={styles.muted}>
          <input type="checkbox" checked={mappedOnly} disabled={!ready}
                 onChange={(e) => setMappedOnly(e.target.checked)} />{" "}
          Show mapped columns only
        </label>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              {shownColumns.map((c) => (
                <th key={c} style={{ ...styles.th, ...(roleOf(c) ? styles.thMapped : {}) }}>
                  {c}
                  {roleOf(c) && <div style={styles.thRole}>→ {roleOf(c)}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => (
              <tr key={i}>
                <td style={styles.tdMuted}>{i + 1}</td>
                {shownColumns.map((c) => (
                  <td key={c} style={{ ...styles.td, ...(roleOf(c) ? styles.tdMapped : {}) }}>{row[c]}</td>
                ))}
              </tr>
            ))}
            {preview.length === 0 && (
              <tr><td colSpan={shownColumns.length + 1} style={styles.empty}>The source has no rows.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <button style={styles.primaryBtn} onClick={onProcess} disabled={!ready || disabled || total_rows === 0}>
        🔄 Process {fmtNum(total_rows)} rows
      </button>
    </div>
  );
}

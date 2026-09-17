const btnBase = {
  border: 0,
  borderRadius: 8,
  padding: "10px 22px",
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "inherit",
};

const smallBtn = {
  ...btnBase,
  background: "#fff",
  color: "#1a56db",
  border: "1px solid #1a56db",
  padding: "6px 12px",
  fontSize: 13,
};

const input = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
  background: "#fff",
};

const td = { padding: 8, borderBottom: "1px solid #eee", fontFamily: "monospace", verticalAlign: "top" };

export const styles = {
  page: {
    minHeight: "100vh",
    background: "#f4f6f8",
    fontFamily: "Segoe UI, system-ui, sans-serif",
    padding: 24,
    boxSizing: "border-box",
  },
  container: { maxWidth: 1000, margin: "0 auto" },
  title: { textAlign: "center", marginBottom: 0 },
  subtitle: { textAlign: "center", color: "#777", marginTop: 4, marginBottom: 4 },
  retention: { textAlign: "center", color: "#555", fontSize: 13, margin: 0 },

  nav: { display: "flex", justifyContent: "center", gap: 8, margin: "18px 0" },
  navBtn: { ...btnBase, background: "#fff", color: "#333", border: "1px solid #ddd", padding: "8px 18px", fontSize: 14 },
  navBtnActive: { background: "#1a56db", color: "#fff", borderColor: "#1a56db" },

  card: { background: "#fff", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.08)" },
  h3: { marginTop: 0 },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },

  dropzone: {
    background: "#fff",
    border: "2px dashed #aac",
    borderRadius: 12,
    padding: 32,
    textAlign: "center",
    cursor: "pointer",
  },

  statRow: { display: "flex", flexWrap: "wrap", gap: 10, margin: "12px 0" },
  stat: { flex: "1 1 110px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, textAlign: "center" },

  tableWrap: { overflowX: "auto", marginTop: 6 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 10, fontSize: 14 },
  th: { textAlign: "left", padding: 8, borderBottom: "2px solid #ddd", background: "#f8fafc", whiteSpace: "nowrap" },
  thMapped: { background: "#e0ecff", color: "#1a3d8f" },
  thRole: { fontSize: 11, fontWeight: 500, color: "#1a56db" },
  td,
  tdText: { ...td, fontFamily: "inherit" },
  tdMuted: { ...td, color: "#999", fontSize: 12 },
  tdMapped: { background: "#f3f7ff" },
  trChanged: { background: "#fffdf5" },

  primaryBtn: { ...btnBase, background: "#1a56db", color: "#fff", marginTop: 10 },
  primaryBtnLink: { ...btnBase, background: "#1a56db", color: "#fff", textDecoration: "none", display: "inline-block" },
  secondaryBtn: { ...btnBase, background: "#fff", color: "#1a56db", border: "1px solid #1a56db" },
  smallBtn,
  smallBtnLink: { ...smallBtn, textDecoration: "none", display: "inline-block" },
  dangerBtn: { ...smallBtn, color: "#b91c1c", border: "1px solid #fca5a5" },

  tabs: { display: "flex", gap: 6, margin: "14px 0", flexWrap: "wrap" },
  tab: { border: "1px solid #ddd", background: "#fff", borderRadius: 20, padding: "6px 14px", cursor: "pointer", fontSize: 13 },
  tabActive: { background: "#1a56db", color: "#fff", borderColor: "#1a56db" },

  toggleGroup: { display: "inline-flex", border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" },
  toggle: { background: "#fff", border: 0, padding: "7px 14px", cursor: "pointer", fontSize: 13 },
  toggleActive: { background: "#1a56db", color: "#fff" },

  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 },
  label: { fontSize: 12, color: "#555", display: "block", marginBottom: 4 },
  input,
  select: input,
  controls: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", margin: "10px 0" },
  pager: { display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", marginTop: 10, flexWrap: "wrap" },

  loading: { background: "#eef4ff", padding: 12, borderRadius: 8, marginBottom: 12 },
  error: { background: "#fee", color: "#900", padding: 12, borderRadius: 8, marginBottom: 12 },
  okBanner: { background: "#eafbea", color: "#166534", padding: 12, borderRadius: 8, marginTop: 8 },
  warnBanner: { background: "#fff8e6", color: "#92600a", padding: 12, borderRadius: 8, marginTop: 8 },
  infoBanner: { background: "#eef4ff", color: "#1a3d8f", padding: 12, borderRadius: 8, marginTop: 8, fontSize: 13 },

  pill: { background: "#fee", color: "#900", padding: "4px 10px", borderRadius: 12, fontSize: 12, fontFamily: "monospace" },
  filePill: { background: "#eef4ff", color: "#1a3d8f", padding: "4px 10px", borderRadius: 12, fontSize: 12, fontFamily: "monospace" },
  badge: { display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, marginLeft: 6, fontFamily: "Segoe UI, system-ui, sans-serif" },

  muted: { color: "#777", fontSize: 13 },
  empty: { padding: 20, textAlign: "center", color: "#777" },
};

import { styles } from "../styles";

export function Stat({ label, value, warn }) {
  return (
    <div style={{ ...styles.stat, ...(warn ? { borderColor: "#e6a700", background: "#fff8e6" } : {}) }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#666" }}>{label}</div>
    </div>
  );
}

const TONES = {
  grey: { background: "#eef0f3", color: "#555" },
  green: { background: "#eafbea", color: "#166534" },
  red: { background: "#fee", color: "#900" },
  amber: { background: "#fff8e6", color: "#92600a" },
  blue: { background: "#e0ecff", color: "#1a3d8f" },
};

export function Badge({ tone = "grey", children }) {
  return <span style={{ ...styles.badge, ...TONES[tone] }}>{children}</span>;
}

export function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={styles.label}>{label}</span>
      {children}
    </label>
  );
}

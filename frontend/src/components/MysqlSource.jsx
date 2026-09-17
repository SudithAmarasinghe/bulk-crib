import { styles } from "../styles";
import { Field } from "./ui";

export const DEFAULT_CONN = {
  host: "localhost",
  port: "3306",
  user: "",
  password: "",
  database: "",
  table: "",
};

export default function MysqlSource({ value, onChange, onConnect, disabled }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const ready = value.host && value.user && value.database && value.table;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !disabled) onConnect();
      }}
    >
      <div style={styles.formGrid}>
        <Field label="Host">
          <input style={styles.input} value={value.host} onChange={set("host")}
                 placeholder="localhost or host.docker.internal" autoComplete="off" />
        </Field>
        <Field label="Port">
          <input style={styles.input} type="number" min="1" max="65535" value={value.port} onChange={set("port")} />
        </Field>
        <Field label="User">
          <input style={styles.input} value={value.user} onChange={set("user")} autoComplete="username" />
        </Field>
        <Field label="Password">
          <input style={styles.input} type="password" value={value.password} onChange={set("password")}
                 autoComplete="current-password" />
        </Field>
        <Field label="Database">
          <input style={styles.input} value={value.database} onChange={set("database")} autoComplete="off" />
        </Field>
        <Field label="Table (table or schema.table)">
          <input style={styles.input} value={value.table} onChange={set("table")}
                 placeholder="customers or crm.customers" autoComplete="off" />
        </Field>
      </div>
      <div style={styles.infoBanner}>
        Only the two columns you map in the next step are read from the table. The password is used for this
        request only and is never stored. If the app runs in Docker and MySQL runs on this computer, use{" "}
        <code>host.docker.internal</code> as the host.
      </div>
      <button type="submit" style={styles.primaryBtn} disabled={!ready || disabled}>
        🔌 Connect &amp; load columns
      </button>
    </form>
  );
}

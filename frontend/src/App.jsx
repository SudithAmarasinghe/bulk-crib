import { useEffect, useState } from "react";
import { styles } from "./styles";
import { api } from "./api";
import ExcelSource from "./components/ExcelSource";
import MysqlSource, { DEFAULT_CONN } from "./components/MysqlSource";
import MappingPreview from "./components/MappingPreview";
import Results from "./components/Results";
import History from "./components/History";

const EMPTY_MAPPING = { id_column: "", type_column: "" };

export default function App() {
  const [nav, setNav] = useState("new"); // "new" | "history"
  const [health, setHealth] = useState(null);

  // Step 1: source
  const [sourceType, setSourceType] = useState("excel"); // "excel" | "mysql"
  const [file, setFile] = useState(null);
  const [conn, setConn] = useState(DEFAULT_CONN);

  // Step 2: inspection + mapping
  const [inspection, setInspection] = useState(null);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);

  // Step 3: stored job (fresh result or opened from history)
  const [job, setJob] = useState(null);

  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.health()
      .then(setHealth)
      .catch((e) => setHealth({ status: "unreachable", error: e.message }));
  }, []);

  async function run(label, action, onSuccess) {
    setLoading(label);
    setError("");
    try {
      onSuccess(await action());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading("");
    }
  }

  const clearFlow = () => {
    setInspection(null);
    setMapping(EMPTY_MAPPING);
    setJob(null);
    setError("");
  };

  const startNew = () => {
    clearFlow();
    setFile(null);
    setNav("new");
  };

  const chooseSource = (type) => {
    setSourceType(type);
    clearFlow();
  };

  const applyInspection = (data) => {
    setInspection(data);
    setMapping({
      id_column: data.suggested_mapping?.id_column || "",
      type_column: data.suggested_mapping?.type_column || "",
    });
  };

  const connPayload = () => ({ ...conn, port: Number(conn.port) || 3306 });

  const handleFile = (f) => {
    if (!f) return;
    clearFlow();
    setFile(f);
    run("Reading Excel file…", () => api.inspectExcel(f), applyInspection);
  };

  const connectMysql = () => {
    clearFlow();
    run("Connecting to MySQL…", () => api.inspectMysql(connPayload()), applyInspection);
  };

  const processSource = () =>
    run(
      "Processing… this may take a few minutes for large sources",
      () => (sourceType === "excel" ? api.processExcel(file, mapping) : api.processMysql(connPayload(), mapping)),
      (j) => {
        setJob(j);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    );

  const openJob = (id) =>
    run("Loading job…", () => api.getJob(id), (j) => {
      setInspection(null);
      setJob(j);
      setNav("new");
    });

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <h1 style={styles.title}>📊 BulkCrib ID Processor</h1>
        <p style={styles.subtitle}>By AI &amp; Data Science Unit — Commercial Bank of Ceylon</p>
        {health &&
          (health.status === "healthy" ? (
            <p style={styles.retention}>
              Backend v{health.version} · {health.jobs_stored} job(s) stored · results are kept for{" "}
              {health.retention_days} days, then deleted automatically
            </p>
          ) : (
            <div style={styles.error}>❌ Backend unreachable: {health.error}</div>
          ))}

        <div style={styles.nav}>
          <button style={{ ...styles.navBtn, ...(nav === "new" ? styles.navBtnActive : {}) }} onClick={() => setNav("new")}>
            ➕ New job
          </button>
          <button style={{ ...styles.navBtn, ...(nav === "history" ? styles.navBtnActive : {}) }} onClick={() => setNav("history")}>
            🕘 History
          </button>
        </div>

        {nav === "history" ? (
          <>
            {loading && <div style={styles.loading}>⏳ {loading}</div>}
            {error && <div style={styles.error}>❌ {error}</div>}
            <History onOpen={openJob} />
          </>
        ) : job ? (
          <Results job={job} onNew={startNew} />
        ) : (
          <>
            <div style={styles.card}>
              <h3 style={styles.h3}>1. Choose a data source</h3>
              <div style={styles.tabs}>
                <button style={{ ...styles.tab, ...(sourceType === "excel" ? styles.tabActive : {}) }} onClick={() => chooseSource("excel")}>
                  📁 Excel upload
                </button>
                <button style={{ ...styles.tab, ...(sourceType === "mysql" ? styles.tabActive : {}) }} onClick={() => chooseSource("mysql")}>
                  🗄️ MySQL table
                </button>
              </div>
              {sourceType === "excel" ? (
                <ExcelSource file={file} onFile={handleFile} disabled={!!loading} />
              ) : (
                <MysqlSource value={conn} onChange={setConn} onConnect={connectMysql} disabled={!!loading} />
              )}
            </div>

            {loading && <div style={styles.loading}>⏳ {loading}</div>}
            {error && <div style={styles.error}>❌ {error}</div>}

            {inspection && (
              <MappingPreview
                inspection={inspection}
                mapping={mapping}
                onMapping={setMapping}
                onProcess={processSource}
                disabled={!!loading}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

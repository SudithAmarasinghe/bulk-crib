"""
BulkCrib backend (v4.0)

Cleans and classifies customer ID numbers taken from either
  * an uploaded Excel file, or
  * a MySQL table,
with the user choosing which source column maps to ID_NUMBER and which to
PERSONAL_NONPERSONAL.

Every processed job (summary, per-row before/after results and the ZIP of
output CSVs) is stored in a local SQLite database and deleted automatically
once it is older than RETENTION_DAYS (default 365).
"""
import asyncio
import io
import json
import logging
import os
import re
import sqlite3
import uuid
import warnings
import zipfile
from contextlib import asynccontextmanager, closing, contextmanager
from datetime import datetime, timedelta, timezone
from typing import Optional

import pandas as pd
import pymysql
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("bulkcrib")

# ---------------------------------------------------------------- settings --
VERSION = "4.0"
ID_COL = "ID_NUMBER"
TYPE_COL = "PERSONAL_NONPERSONAL"
SPECIAL_CHARS = ['/', '(', ')', '\\', ' ', ',', '.']
CHUNK_SIZE = 10000          # records per output CSV
PREVIEW_ROWS = 20           # rows shown in the pre-processing preview

DATA_DIR = os.environ.get(
    "DATA_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
)
DB_PATH = os.path.join(DATA_DIR, "bulkcrib.db")
RETENTION_DAYS = int(os.environ.get("RETENTION_DAYS", "365"))
CLEANUP_INTERVAL_HOURS = float(os.environ.get("CLEANUP_INTERVAL_HOURS", "24"))
MAX_SOURCE_ROWS = int(os.environ.get("MAX_SOURCE_ROWS", "1000000"))
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173"
    ).split(",")
    if o.strip()
]

IDENT_RE = re.compile(r"^[A-Za-z0-9_$]+$")
ROW_STATUSES = ("ok", "empty_id", "invalid_type")


# ----------------------------------------------------------------- storage --
SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id         TEXT PRIMARY KEY,
    created_at     TEXT NOT NULL,
    source_type    TEXT NOT NULL,
    source_label   TEXT NOT NULL,
    source_json    TEXT NOT NULL,
    id_column      TEXT NOT NULL,
    type_column    TEXT NOT NULL,
    summary_json   TEXT NOT NULL,
    file_list_json TEXT NOT NULL,
    zip_blob       BLOB NOT NULL,
    zip_size       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs (created_at);

CREATE TABLE IF NOT EXISTS job_rows (
    job_id      TEXT NOT NULL,
    row_no      INTEGER NOT NULL,
    original_id TEXT NOT NULL,
    cleaned_id  TEXT NOT NULL,
    record_type TEXT NOT NULL,
    id_type     TEXT NOT NULL,
    status      TEXT NOT NULL,
    changed     INTEGER NOT NULL,
    duplicate   INTEGER NOT NULL,
    PRIMARY KEY (job_id, row_no)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_rows_changed ON job_rows (job_id, changed);
"""


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    with db() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
    log.info("SQLite store: %s (retention %s days)", DB_PATH, RETENTION_DAYS)


def purge_expired() -> int:
    """Delete every job created more than RETENTION_DAYS ago. Returns count."""
    cutoff = (utcnow() - timedelta(days=RETENTION_DAYS)).isoformat()
    with db() as conn:
        ids = [r["job_id"] for r in conn.execute(
            "SELECT job_id FROM jobs WHERE created_at <= ?", (cutoff,))]
        if ids:
            params = [(i,) for i in ids]
            conn.executemany("DELETE FROM job_rows WHERE job_id = ?", params)
            conn.executemany("DELETE FROM jobs WHERE job_id = ?", params)
    if ids:
        # Reclaim disk space; VACUUM must run outside a transaction.
        with closing(sqlite3.connect(DB_PATH, isolation_level=None)) as c:
            c.execute("VACUUM")
        log.info("Retention: deleted %d expired job(s)", len(ids))
    return len(ids)


def job_count() -> int:
    with db() as conn:
        return conn.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]


def save_job(source: dict, id_column: str, type_column: str, summary: dict,
             file_list: list, zip_bytes: bytes, rows: pd.DataFrame) -> dict:
    job_id = str(uuid.uuid4())
    created = utcnow().isoformat()
    row_cols = ["row_no", "original_id", "cleaned_id", "record_type",
                "id_type", "status", "changed", "duplicate"]
    row_values = rows[row_cols].to_numpy(dtype=object).tolist()
    with db() as conn:
        conn.execute(
            """INSERT INTO jobs (job_id, created_at, source_type, source_label, source_json,
                                 id_column, type_column, summary_json, file_list_json,
                                 zip_blob, zip_size)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (job_id, created, source["type"], source["label"], json.dumps(source),
             id_column, type_column, json.dumps(summary), json.dumps(file_list),
             sqlite3.Binary(zip_bytes), len(zip_bytes)),
        )
        conn.executemany(
            f"INSERT INTO job_rows ({', '.join(['job_id'] + row_cols)}) "
            f"VALUES ({', '.join('?' * (len(row_cols) + 1))})",
            ([job_id] + r for r in row_values),
        )
    return job_id


def _job_public(row: sqlite3.Row) -> dict:
    created = datetime.fromisoformat(row["created_at"])
    return {
        "job_id": row["job_id"],
        "created_at": row["created_at"],
        "expires_at": (created + timedelta(days=RETENTION_DAYS)).isoformat(),
        "source": json.loads(row["source_json"]),
        "mapping": {"id_column": row["id_column"], "type_column": row["type_column"]},
        "summary": json.loads(row["summary_json"]),
        "file_list": json.loads(row["file_list_json"]),
        "zip_size": row["zip_size"],
    }


JOB_COLUMNS = ("job_id, created_at, source_type, source_label, source_json, id_column, "
               "type_column, summary_json, file_list_json, zip_size")


def get_job(job_id: str) -> dict:
    with db() as conn:
        row = conn.execute(f"SELECT {JOB_COLUMNS} FROM jobs WHERE job_id = ?",
                           (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Job not found. It may have been deleted or expired.")
    return _job_public(row)


def list_jobs(limit: int) -> list:
    with db() as conn:
        rows = conn.execute(
            f"SELECT {JOB_COLUMNS} FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [_job_public(r) for r in rows]


def query_rows(job_id: str, view: str, status: Optional[str], search: Optional[str],
               page: int, page_size: int) -> dict:
    where, params = ["job_id = ?"], [job_id]
    if view == "changed":
        where.append("changed = 1")
    if status:
        where.append("status = ?")
        params.append(status)
    if search:
        like = "%" + re.sub(r"([%_\\])", r"\\\1", search.strip()) + "%"
        where.append("(original_id LIKE ? ESCAPE '\\' OR cleaned_id LIKE ? ESCAPE '\\')")
        params += [like, like]
    clause = " AND ".join(where)
    with db() as conn:
        total = conn.execute(f"SELECT COUNT(*) FROM job_rows WHERE {clause}", params).fetchone()[0]
        rows = conn.execute(
            f"""SELECT row_no, original_id, cleaned_id, record_type, id_type, status,
                       changed, duplicate
                FROM job_rows WHERE {clause} ORDER BY row_no LIMIT ? OFFSET ?""",
            params + [page_size, (page - 1) * page_size],
        ).fetchall()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "rows": [dict(r) for r in rows],
    }


# ---------------------------------------------------------- processing core --
def to_text(v) -> str:
    """Normalise any cell value to a stripped string ('' for missing)."""
    if v is None:
        return ""
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", "replace").strip()
    if isinstance(v, float):
        if v != v:                       # NaN
            return ""
        if v.is_integer():               # 987654321.0 -> "987654321"
            return str(int(v))
    try:
        if pd.isna(v):
            return ""
    except (TypeError, ValueError):
        pass
    return str(v).strip()


def clean_id_number(id_value) -> str:
    """Remove special characters from an ID number."""
    id_str = to_text(id_value)
    for char in SPECIAL_CHARS:
        id_str = id_str.replace(char, "")
    return id_str


def determine_id_type(id_number) -> str:
    s = to_text(id_number)
    if not s:
        return "NIC"
    return "PassportNumber" if s[0].isalpha() else "NIC"


def get_date() -> str:
    return datetime.today().strftime("%d%m%y")


def suggest_mapping(columns: list) -> dict:
    """Best-effort guess of which source columns hold the ID and the P/N type."""
    def pick(candidates, exact):
        for name in exact:
            for c in columns:
                if c == name:
                    return c
        for name in exact:
            for c in columns:
                if c.lower() == name.lower():
                    return c
        for c in columns:
            low = c.lower()
            if any(k in low for k in candidates):
                return c
        return None

    id_col = pick(["id_number", "idnumber", "nic", "id_no", "idno", "identification", "_id", "id"],
                  [ID_COL])
    type_col = pick(["personal", "nonpersonal", "cust_type", "customer_type", "subject_type",
                     "category", "type"], [TYPE_COL])
    if type_col == id_col:
        type_col = None
    return {"id_column": id_col, "type_column": type_col}


def validate_mapping(columns: list, id_column: str, type_column: str):
    missing = [c for c in (id_column, type_column) if c not in columns]
    if missing:
        raise HTTPException(400, f"Column(s) not found in source: {missing}. "
                                 f"Available: {list(columns)}")
    if id_column == type_column:
        raise HTTPException(400, "The ID column and the type column must be different")


def describe_source(df: pd.DataFrame, source: dict) -> dict:
    columns = [str(c) for c in df.columns]
    preview = [
        {col: to_text(v) for col, v in zip(columns, rec)}
        for rec in df.head(PREVIEW_ROWS).itertuples(index=False, name=None)
    ]
    return {
        "source": source,
        "columns": columns,
        "total_rows": int(len(df)),
        "preview": preview,
        "suggested_mapping": suggest_mapping(columns),
    }


def process_dataframe(df: pd.DataFrame, id_column: str, type_column: str):
    """
    Core processing engine.
    Returns (files: dict[filename -> DataFrame], summary: dict, rows: DataFrame)
    where `rows` has one record per source row with before/after values.
    """
    total = len(df)
    if total == 0:
        raise ValueError("The source contains no data rows")
    date_str = get_date()

    rows = pd.DataFrame({
        "row_no": range(1, total + 1),
        "original_id": df[id_column].map(to_text).to_numpy(),
        "record_type": df[type_column].map(to_text).str.upper().to_numpy(),
    })

    # ---------- Row status: dropped (empty ID / invalid type) or ok ----------
    empty = rows["original_id"] == ""
    invalid = ~empty & ~rows["record_type"].isin(["P", "N"])
    rows["status"] = "ok"
    rows.loc[empty, "status"] = "empty_id"
    rows.loc[invalid, "status"] = "invalid_type"
    ok = rows["status"] == "ok"
    if not ok.any():
        raise ValueError("No valid data found after cleaning")

    # ---------- Cleaning & change tracking ----------
    rows["cleaned_id"] = ""
    rows.loc[ok, "cleaned_id"] = rows.loc[ok, "original_id"].map(clean_id_number)
    rows["changed"] = (ok & (rows["original_id"] != rows["cleaned_id"])).astype(int)

    is_corp = ok & (rows["record_type"] == "N")
    is_cons = ok & (rows["record_type"] == "P")
    rows["id_type"] = ""
    rows.loc[is_corp, "id_type"] = "BusinessRegistrationNumber"
    rows.loc[is_cons, "id_type"] = rows.loc[is_cons, "cleaned_id"].map(determine_id_type)

    # ---------- Duplicate detection (after cleaning, valid rows only) ----------
    ok_rows = rows.loc[ok]
    rows["duplicate"] = 0
    rows.loc[ok_rows.index[ok_rows["cleaned_id"].duplicated(keep=False)], "duplicate"] = 1
    dup_ids = sorted(rows.loc[rows["duplicate"] == 1, "cleaned_id"].unique().tolist())

    # ---------- Output files ----------
    files = {}
    ch = rows.loc[rows["changed"] == 1]
    changed_export = pd.DataFrame({
        "Original_ID_NUMBER": ch["original_id"].to_numpy(),
        "New_ID_NUMBER": ch["cleaned_id"].to_numpy(),
        TYPE_COL: ch["record_type"].to_numpy(),
    })
    ch_p = changed_export[changed_export[TYPE_COL] == "P"]
    ch_n = changed_export[changed_export[TYPE_COL] == "N"]
    if not ch_p.empty:
        files[f"consumer_updated_ids_{date_str}.csv"] = ch_p
    if not ch_n.empty:
        files[f"corporate_updated_ids_{date_str}.csv"] = ch_n

    def chunk_out(sub: pd.DataFrame, subject: str, prefix: str) -> int:
        if sub.empty:
            return 0
        out = pd.DataFrame({
            "IDNumberType": sub["id_type"].to_numpy(),
            "IDNumber": sub["cleaned_id"].to_numpy(),
            "RequestedReport": "CreditinfoReport",
            "SubjectType": subject,
        })
        out[""] = ""
        out["_"] = ""
        n = 0
        for i in range(0, len(out), CHUNK_SIZE):
            files[f"{prefix}_Bulk{i // CHUNK_SIZE + 1}_{date_str}.csv"] = out.iloc[i:i + CHUNK_SIZE]
            n += 1
        return n

    corp_chunks = chunk_out(rows.loc[is_corp], "Company", "Corporate")
    cons_chunks = chunk_out(rows.loc[is_cons].sort_values("cleaned_id", kind="stable"),
                            "Individual", "Consumer")

    # ---------- Summary ----------
    n_corp, n_cons = int(is_corp.sum()), int(is_cons.sum())
    nic_count = int((rows.loc[is_cons, "id_type"] == "NIC").sum())
    valid_records = int(ok.sum())
    empty_removed, invalid_removed = int(empty.sum()), int(invalid.sum())
    changed_count = int(rows["changed"].sum())
    total_output = n_corp + n_cons
    summary = {
        "input": {
            "total_uploaded": int(total),
            "empty_removed": empty_removed,
            "invalid_type_removed": invalid_removed,
            "valid_records": valid_records,
        },
        "output": {
            "total_output_records": total_output,
            "corporate_records": n_corp,
            "consumer_records": n_cons,
            "nic_count": nic_count,
            "passport_count": n_cons - nic_count,
            "corporate_files": corp_chunks,
            "consumer_files": cons_chunks,
            "total_files": len(files),
        },
        "comparison": {
            "records_match": total_output == total - empty_removed - invalid_removed,
            "records_dropped": int(total - total_output),
            "ids_changed": changed_count,
            "ids_unchanged": valid_records - changed_count,
            "change_rate_percent": round(changed_count / valid_records * 100, 2) if valid_records else 0,
        },
        "duplicates": {
            "duplicate_record_count": int(rows["duplicate"].sum()),
            "unique_duplicate_id_count": len(dup_ids),
            "unique_duplicate_ids": dup_ids[:200],
        },
        "processed_at": utcnow().isoformat(),
    }
    return files, summary, rows


def build_zip(files: dict) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, dataframe in files.items():
            csv_buf = io.StringIO()
            dataframe.to_csv(csv_buf, index=False)
            zf.writestr(name, csv_buf.getvalue())
    return buf.getvalue()


def run_job(df: pd.DataFrame, source: dict, id_column: str, type_column: str) -> dict:
    validate_mapping([str(c) for c in df.columns], id_column, type_column)
    try:
        files, summary, rows = process_dataframe(df, id_column, type_column)
    except ValueError as e:
        raise HTTPException(400, str(e))
    zip_bytes = build_zip(files)
    job_id = save_job(source, id_column, type_column, summary, list(files.keys()), zip_bytes, rows)
    log.info("Job %s: %s -> %d rows, %d changed", job_id, source["label"],
             summary["input"]["total_uploaded"], summary["comparison"]["ids_changed"])
    return get_job(job_id)


# ------------------------------------------------------------ Excel source --
def read_excel_upload(file: UploadFile) -> pd.DataFrame:
    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "File must be .xlsx or .xls")
    contents = file.file.read()
    if not contents:
        raise HTTPException(400, "The uploaded file is empty")
    try:
        # dtype=str keeps IDs as text so leading zeros and long numbers survive.
        df = pd.read_excel(io.BytesIO(contents), dtype=str)
    except Exception as e:
        raise HTTPException(400, f"Could not read Excel file: {e}")
    df.columns = [str(c).strip() for c in df.columns]
    if len(df) > MAX_SOURCE_ROWS:
        raise HTTPException(400, f"File has {len(df):,} rows; the limit is {MAX_SOURCE_ROWS:,}")
    return df


def excel_source(file: UploadFile) -> dict:
    return {"type": "excel", "label": file.filename, "filename": file.filename}


# ------------------------------------------------------------ MySQL source --
class MySQLConnection(BaseModel):
    host: str = Field(..., min_length=1)
    port: int = Field(3306, ge=1, le=65535)
    user: str = Field(..., min_length=1)
    password: str = ""
    database: str = Field(..., min_length=1)
    table: str = Field(..., min_length=1, description="`table` or `schema.table`")


class MySQLProcessRequest(MySQLConnection):
    id_column: str = Field(..., min_length=1)
    type_column: str = Field(..., min_length=1)


def qualified_table(table: str) -> str:
    parts = [p.strip().strip("`") for p in table.strip().split(".")]
    if not 1 <= len(parts) <= 2 or not all(IDENT_RE.match(p) for p in parts):
        raise HTTPException(
            400, "Table must be written as table or schema.table using only letters, digits, _ and $")
    return ".".join(f"`{p}`" for p in parts)


def quote_ident(name: str) -> str:
    return "`" + name.replace("`", "``") + "`"


def _mysql_error(e: Exception) -> str:
    args = getattr(e, "args", ())
    return f"[{args[0]}] {args[1]}" if len(args) >= 2 else str(e)


def _docker_hint(host: str) -> str:
    if host in ("localhost", "127.0.0.1") and os.path.exists("/.dockerenv"):
        return (" The backend is running inside Docker, so 'localhost' is the container itself. "
                "Use host.docker.internal to reach a MySQL server on this computer.")
    return ""


def mysql_connect(c: MySQLConnection):
    try:
        return pymysql.connect(
            host=c.host, port=c.port, user=c.user, password=c.password, database=c.database,
            connect_timeout=10, read_timeout=600, write_timeout=60, charset="utf8mb4",
        )
    except pymysql.MySQLError as e:
        raise HTTPException(400, f"MySQL connection failed: {_mysql_error(e)}{_docker_hint(c.host)}")
    except OSError as e:
        raise HTTPException(400, f"MySQL connection failed: {e}{_docker_hint(c.host)}")


def mysql_source(c: MySQLConnection) -> dict:
    return {
        "type": "mysql",
        "label": f"{c.host}:{c.port}/{c.database} · {c.table}",
        "host": c.host, "port": c.port, "database": c.database, "table": c.table,
    }


def mysql_inspect(c: MySQLConnection) -> dict:
    tbl = qualified_table(c.table)
    with closing(mysql_connect(c)) as conn, conn.cursor() as cur:
        try:
            cur.execute(f"SHOW COLUMNS FROM {tbl}")
            columns = [r[0] for r in cur.fetchall()]
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            total = int(cur.fetchone()[0])
            cur.execute(f"SELECT * FROM {tbl} LIMIT {PREVIEW_ROWS}")
            preview_cols = [d[0] for d in cur.description]
            preview = [{col: to_text(v) for col, v in zip(preview_cols, rec)} for rec in cur.fetchall()]
        except pymysql.MySQLError as e:
            raise HTTPException(400, f"MySQL query failed: {_mysql_error(e)}")
    return {
        "source": mysql_source(c),
        "columns": columns,
        "total_rows": total,
        "preview": preview,
        "suggested_mapping": suggest_mapping(columns),
    }


def mysql_fetch(req: MySQLProcessRequest) -> pd.DataFrame:
    tbl = qualified_table(req.table)
    with closing(mysql_connect(req)) as conn, conn.cursor() as cur:
        try:
            cur.execute(f"SHOW COLUMNS FROM {tbl}")
            columns = [r[0] for r in cur.fetchall()]
            validate_mapping(columns, req.id_column, req.type_column)
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            total = int(cur.fetchone()[0])
            if total > MAX_SOURCE_ROWS:
                raise HTTPException(400, f"Table has {total:,} rows; the limit is {MAX_SOURCE_ROWS:,}")
            cur.execute(f"SELECT {quote_ident(req.id_column)}, {quote_ident(req.type_column)} FROM {tbl}")
            data = cur.fetchall()
        except pymysql.MySQLError as e:
            raise HTTPException(400, f"MySQL query failed: {_mysql_error(e)}")
    return pd.DataFrame(list(data), columns=[req.id_column, req.type_column], dtype=object)


# ------------------------------------------------------------------- app --
async def _cleanup_loop():
    while True:
        await asyncio.sleep(CLEANUP_INTERVAL_HOURS * 3600)
        try:
            await asyncio.to_thread(purge_expired)
        except Exception:
            log.exception("Retention cleanup failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    try:
        purge_expired()
    except Exception:
        log.exception("Retention cleanup at startup failed")
    task = asyncio.create_task(_cleanup_loop())
    yield
    task.cancel()


app = FastAPI(title="BulkCrib ID Processor API", version=VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "version": VERSION,
        "retention_days": RETENTION_DAYS,
        "max_source_rows": MAX_SOURCE_ROWS,
        "jobs_stored": job_count(),
    }


# ---- Option 1: Excel upload ----
@app.post("/api/excel/inspect")
def excel_inspect(file: UploadFile = File(...)):
    """Read the workbook and return its columns, row count, preview and a suggested mapping."""
    df = read_excel_upload(file)
    return describe_source(df, excel_source(file))


@app.post("/api/excel/process")
def excel_process(
    file: UploadFile = File(...),
    id_column: str = Form(ID_COL),
    type_column: str = Form(TYPE_COL),
):
    """Process the workbook using the chosen column mapping. Returns the stored job."""
    df = read_excel_upload(file)
    return run_job(df, excel_source(file), id_column, type_column)


# ---- Option 2: MySQL table ----
@app.post("/api/mysql/inspect")
def mysql_inspect_endpoint(req: MySQLConnection):
    """Connect to MySQL and return the table's columns, row count, preview and suggested mapping."""
    return mysql_inspect(req)


@app.post("/api/mysql/process")
def mysql_process_endpoint(req: MySQLProcessRequest):
    """Read the two mapped columns from MySQL and process them. Returns the stored job."""
    df = mysql_fetch(req)
    return run_job(df, mysql_source(req), req.id_column, req.type_column)


# ---- Stored jobs ----
@app.get("/api/jobs")
def jobs_list(limit: int = Query(100, ge=1, le=1000)):
    return {"retention_days": RETENTION_DAYS, "jobs": list_jobs(limit)}


@app.get("/api/jobs/{job_id}")
def jobs_get(job_id: str):
    return get_job(job_id)


@app.get("/api/jobs/{job_id}/rows")
def jobs_rows(
    job_id: str,
    view: str = Query("all", description="all | changed"),
    status: Optional[str] = Query(None, description="ok | empty_id | invalid_type"),
    search: Optional[str] = Query(None, description="substring of the original or cleaned ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
):
    """Per-row before/after results, paginated. view=changed returns only modified IDs."""
    if view not in ("all", "changed"):
        raise HTTPException(400, "view must be 'all' or 'changed'")
    if status and status not in ROW_STATUSES:
        raise HTTPException(400, f"status must be one of {ROW_STATUSES}")
    get_job(job_id)  # 404 if missing
    return query_rows(job_id, view, status or None, search or None, page, page_size)


@app.get("/api/jobs/{job_id}/download")
def jobs_download(job_id: str):
    with db() as conn:
        row = conn.execute("SELECT zip_blob, created_at FROM jobs WHERE job_id = ?",
                           (job_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Job not found. It may have been deleted or expired.")
    stamp = datetime.fromisoformat(row["created_at"]).strftime("%d%m%y")
    return StreamingResponse(
        io.BytesIO(row["zip_blob"]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="processed_files_{stamp}.zip"'},
    )


@app.delete("/api/jobs/{job_id}")
def jobs_delete(job_id: str):
    get_job(job_id)
    with db() as conn:
        conn.execute("DELETE FROM job_rows WHERE job_id = ?", (job_id,))
        conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
    return {"deleted": job_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

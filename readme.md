# BulkCrib — ID Processor

**By AI & Data Science Unit — Commercial Bank of Ceylon**

A dockerized web application that cleans, validates, and formats customer ID numbers for bulk credit report submission. Data can come from an **uploaded Excel file** or directly from a **MySQL table**; you choose which source columns hold the ID number and the Personal/Corporate flag, preview the data, process it, and review every ID that was changed. Each processed job is kept for one year and can be re-opened or re-downloaded from the History screen.

---

## Table of Contents

1. [What's New in v4.0](#whats-new-in-v40)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Project Structure](#project-structure)
5. [Quick Start](#quick-start)
6. [Usage](#usage)
7. [Features](#features)
8. [Data Source Requirements](#data-source-requirements)
9. [Storage & Retention](#storage--retention)
10. [API Reference](#api-reference)
11. [Common Commands](#common-commands)
12. [Troubleshooting](#troubleshooting)
13. [Configuration](#configuration)
14. [Running Without Docker (Development)](#running-without-docker-development)
15. [Support](#support)

---

## What's New in v4.0

| Area | Change |
|---|---|
| Data sources | **Option 1:** upload an Excel file. **Option 2:** read a MySQL table (host, database, table + credentials). |
| Column mapping | Source columns no longer need to be named `ID_NUMBER` / `PERSONAL_NONPERSONAL`. Pick any two columns; the app suggests a mapping automatically. |
| Preview | The first 20 rows of the file or table are shown, with the mapped columns highlighted, before anything is processed. |
| ID changes view | Every source row is listed with its original and cleaned ID. Toggle between **All IDs** and **Changed only**, filter by status (kept / dropped), search, and page through large results. |
| Job history | Results, the per-row change list and the ZIP are stored in a SQLite database for **365 days** (configurable) and deleted automatically afterwards. Past jobs can be re-opened, re-downloaded or deleted from **History**. |
| Configuration | Retention period, row limit, CORS origins and data directory are set with environment variables in `docker-compose.yml`. |

---

## Architecture

```
┌─────────────────────┐   HTTP    ┌──────────────────────┐   file    ┌────────────────────┐
│  React Frontend      │ ───────► │  FastAPI Backend      │ ───────► │  SQLite job store   │
│  (nginx)             │          │  (uvicorn)            │          │  /app/data/         │
│  localhost:3000      │          │  localhost:8000       │          │  (volume backend_data)│
└─────────────────────┘          └──────────┬───────────┘          └────────────────────┘
    Docker container                        │  TCP 3306 (Option 2 only)
                                            ▼
                                  ┌──────────────────────┐
                                  │  Your MySQL server    │
                                  │  (read-only SELECT)   │
                                  └──────────────────────┘
```

- **Frontend**: React (built with Vite), served as static files via nginx
- **Backend**: FastAPI (Python), performs all reading, cleaning and classification
- **Job store**: SQLite database file on a named Docker volume. Holds every job's summary, per-row before/after results and output ZIP until it expires. No separate database server is required.
- **MySQL (optional)**: the customer data source for Option 2. The backend only runs `SHOW COLUMNS`, `SELECT COUNT(*)`, a 20-row preview and a `SELECT` of the two mapped columns. Nothing is written to MySQL and the password is never stored.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker Desktop | Latest | Includes Docker Compose. [Download here](https://www.docker.com/products/docker-desktop/). Docker Desktop must be **signed in** if your organisation enforces it. |
| Windows / macOS / Linux | 64-bit | WSL2 backend recommended on Windows |
| Free disk space | ~2 GB + job store | Images and build cache, plus the SQLite store (see [Storage & Retention](#storage--retention)) |
| Free ports | 3000, 8000 | Must not be in use by other applications |
| MySQL access (Option 2 only) | MySQL 5.7+ / 8.x / MariaDB | A user with `SELECT` on the source table, reachable from the Docker network |

No local Python or Node.js installation is required — everything runs inside containers.

---

## Project Structure

```
BulkCrib/
├── docker-compose.yml          # two services + persistent volume backend_data
├── readme.md
├── sample_generation.py        # creates sample_test_data.xlsx
├── sample_test_data.xlsx       # 14-row test file exercising every dashboard tab
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── requirements.txt        # fastapi, uvicorn, pandas, openpyxl, xlrd, pymysql
│   ├── main.py                 # API, processing engine, MySQL reader, SQLite store, retention
│   └── data/                   # created at runtime (SQLite store) — inside the volume in Docker
└── frontend/
    ├── Dockerfile
    ├── .dockerignore
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx                     # navigation + 3-step flow (source → mapping → results)
        ├── api.js                      # backend calls
        ├── styles.js
        └── components/
            ├── ExcelSource.jsx         # Option 1: drag & drop upload
            ├── MysqlSource.jsx         # Option 2: connection form
            ├── MappingPreview.jsx      # column mapping + data preview
            ├── Results.jsx             # summary / comparison / ID changes / duplicates tabs
            ├── IdTable.jsx             # paginated all-IDs / changed-only table
            ├── History.jsx             # stored jobs (view, download, delete)
            └── ui.jsx
```

---

## Quick Start

1. **Open a terminal** (PowerShell, Command Prompt or macOS Terminal) and go to the project folder:
   ```powershell
   cd "path/to/your/folder/"
   ```

2. **Build and start both containers:**
   ```powershell
   docker compose up --build
   ```
   The first build takes 3–5 minutes (downloads base images, installs dependencies).

3. **Open the application:**
   - Frontend (UI): [http://localhost:3000](http://localhost:3000)
   - Backend health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)
   - API documentation (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)

4. **Stop the application** when done (press `Ctrl+C`, then):
   ```powershell
   docker compose down
   ```
   Stored jobs survive a `down`/`up` cycle because they live on the `backend_data` volume.

---

## Usage

The screen is a three-step flow. The header shows how many jobs are stored and the current retention period.

### Step 1 — Choose a data source

**Option 1: Excel upload**
1. Select **📁 Excel upload**.
2. Drag and drop, or click to browse for, an `.xlsx` or `.xls` file.
3. The file is read and its columns and first 20 rows are shown in Step 2.

**Option 2: MySQL table**
1. Select **🗄️ MySQL table**.
2. Enter the host, port, user, password, database and table. The table can be written as `customers` or `schema.customers`.
   - If the app runs in Docker and MySQL runs on the same computer, use **`host.docker.internal`** as the host, not `localhost`.
3. Click **🔌 Connect & load columns**. The backend connects, reads the column list, row count and a 20-row preview.

### Step 2 — Map columns and preview

1. Two drop-downs ask which source column holds **ID_NUMBER** and which holds **PERSONAL_NONPERSONAL** (values `P` / `N`).
   The app pre-selects a mapping when it can recognise the columns (exact names first, then case-insensitive, then common names such as `nic`, `id_no`, `customer_type`).
2. The preview table highlights the mapped columns. Tick **Show mapped columns only** to hide the rest.
3. The two columns must be different. Click **🔄 Process N rows** when the mapping is right.

### Step 3 — Review results

- **Summary** — record counts, corporate/consumer split, NIC/passport breakdown, and the list of files in the ZIP.
- **Comparison** — source vs. output reconciliation with a pass/fail banner and the number of unchanged vs. modified IDs.
- **ID changes** — every source row with its original and cleaned ID:
  - **All IDs** lists every row including dropped ones; **Changed only** lists just the rows whose ID was modified.
  - Filter by status (**Kept**, **Dropped · empty ID**, **Dropped · invalid type**), search for an ID (matches original or cleaned value), and choose 50–1000 rows per page.
  - Rows are marked **changed** and **duplicate** where applicable.
- **Duplicates** — IDs that collapse to the same value after cleaning.
- **⬇️ Download ZIP** saves the processed CSV files. **➕ New job** returns to Step 1.

### History

**🕘 History** lists every stored job with its date, source, mapping, rows in → out, changed count and expiry date. From here you can **View** a job (re-opens the full results including the ID changes view), download its **ZIP**, or **Delete** it before it expires.

---

## Features

### Core Processing
- Removes special characters (`/`, `(`, `)`, `\`, spaces, commas, periods) from ID numbers
- Splits records into **Corporate** (`N`) and **Consumer** (`P`) categories (case-insensitive; surrounding spaces ignored)
- Assigns ID types: `BusinessRegistrationNumber` (corporate), `NIC` or `PassportNumber` (consumer, based on first character)
- Chunks large output files into batches of 10,000 records
- Generates change-tracking files (`consumer_updated_ids_*.csv`, `corporate_updated_ids_*.csv`) for any ID numbers that were modified
- Reads Excel cells as text so numeric IDs keep leading zeros and never gain a trailing `.0`

### Data Sources & Mapping (v4.0)
- Excel upload or MySQL table as the source
- Free column mapping with automatic suggestion
- Pre-processing preview of the first 20 rows (all columns) with mapped columns highlighted

### Review & Reconciliation
- **Source vs. output comparison** — reconciles record counts and flags dropped records (empty IDs, invalid type values)
- **Per-row ID change view** — all rows or changed-only, with status filter, search and paging
- **Duplicate detection** — identifies IDs that become identical after cleaning (e.g., `123 456` and `123456`)

### Job Store (v4.0)
- Every job (summary, per-row results, ZIP) is stored server-side in SQLite for `RETENTION_DAYS` (default 365) and deleted automatically afterwards
- History screen to re-open, re-download or delete past jobs

---

## Data Source Requirements

### Excel files
- Formats: `.xlsx`, `.xls`
- Headers must be in row 1; data starts in row 2. The first sheet is used.
- Any column names are accepted — you map them in Step 2. Columns named `ID_NUMBER` and `PERSONAL_NONPERSONAL` are mapped automatically.
- The type column must contain `P` (Personal) or `N` (Corporate). Other values cause the row to be dropped and reported.
- Maximum size: `MAX_SOURCE_ROWS` rows (default 1,000,000). Under 100,000 rows is recommended for fast processing.

### MySQL tables
- The MySQL user needs `SELECT` on the table (no write access is used or required).
- Table name: `table` or `schema.table`, letters, digits, `_` and `$` only.
- The whole table is read (only the two mapped columns), so the same `MAX_SOURCE_ROWS` limit applies. Create a view in MySQL if you need to filter rows.
- Network: the backend container must reach the MySQL host and port. For a MySQL server on the Docker host machine use `host.docker.internal`; for a server elsewhere use its hostname or IP and make sure the firewall allows port 3306 from this machine.
- The password is sent to the backend for that request only and is not stored. The job history records only the host, port, database and table.

A ready-made test file, `sample_test_data.xlsx`, is included (regenerate it with `python sample_generation.py`). It exercises every tab: changed IDs, an empty ID, an invalid type value and one duplicate.

---

## Storage & Retention

**Where jobs are kept.** The backend stores jobs in a SQLite database file, `bulkcrib.db`, inside the container's `/app/data` directory, which `docker-compose.yml` maps to the named volume `backend_data`. The store survives `docker compose down` and image rebuilds; it is removed only by `docker compose down -v` or by deleting the volume.

**What is stored per job:** the summary statistics, one record per source row (original ID, cleaned ID, type, ID type, status, changed/duplicate flags), the file list, the ZIP of output CSVs, and the source description (file name, or MySQL host/database/table — never the password).

**Retention.** A job is deleted automatically once it is older than `RETENTION_DAYS` (default **365**). The cleanup runs when the backend starts and then every `CLEANUP_INTERVAL_HOURS` (default 24). Changing `RETENTION_DAYS` applies to existing jobs as well, because expiry is computed from the job's creation time. Individual jobs can also be deleted from History at any time.

**Why SQLite rather than a bundled MySQL.** The app has a single backend process writing small blobs, which SQLite handles without any extra service, credentials, port or memory. Backups are a file copy. A MySQL or PostgreSQL container would add operational overhead without a benefit at this scale. The MySQL in Option 2 is the *customer's* source database and is deliberately not used for the app's own storage, so the tool keeps working when that server is unavailable.

**Disk usage.** Roughly 100–150 bytes per source row plus the compressed ZIP (a few hundred KB per 100,000 IDs). A year of daily 100,000-row jobs is in the order of 5 GB.

**Backup and restore:**
```powershell
# Back up the store to the current folder
docker compose cp backend:/app/data/bulkcrib.db ./bulkcrib-backup.db

# Restore (stop the backend first)
docker compose stop backend
docker compose cp ./bulkcrib-backup.db backend:/app/data/bulkcrib.db
docker compose start backend
```

---

## API Reference

Base URL: `http://localhost:8000`. Interactive documentation with request/response schemas: [http://localhost:8000/docs](http://localhost:8000/docs).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check: version, retention days, row limit, number of stored jobs |
| `POST` | `/api/excel/inspect` | Multipart `file`. Returns columns, row count, 20-row preview and suggested mapping |
| `POST` | `/api/excel/process` | Multipart `file` + form fields `id_column`, `type_column`. Processes and stores the job; returns the job |
| `POST` | `/api/mysql/inspect` | JSON `{host, port, user, password, database, table}`. Returns columns, row count, preview, suggested mapping |
| `POST` | `/api/mysql/process` | Same JSON plus `id_column`, `type_column`. Processes and stores the job; returns the job |
| `GET` | `/api/jobs?limit=100` | Stored jobs, newest first (no ZIP data) |
| `GET` | `/api/jobs/{job_id}` | One job: source, mapping, summary, file list, created/expiry timestamps |
| `GET` | `/api/jobs/{job_id}/rows` | Per-row results. Query: `view=all\|changed`, `status=ok\|empty_id\|invalid_type`, `search=`, `page=`, `page_size=` (max 1000) |
| `GET` | `/api/jobs/{job_id}/download` | ZIP of processed CSV files |
| `DELETE` | `/api/jobs/{job_id}` | Delete a job before it expires |

Example:
```bash
# Inspect a workbook
curl -F "file=@sample_test_data.xlsx" http://localhost:8000/api/excel/inspect

# Process with an explicit mapping
curl -F "file=@sample_test_data.xlsx" -F id_column=ID_NUMBER -F type_column=PERSONAL_NONPERSONAL \
     http://localhost:8000/api/excel/process

# Changed IDs only, 50 per page
curl "http://localhost:8000/api/jobs/<job_id>/rows?view=changed&page_size=50"
```

---

## Common Commands

```powershell
# Start in the foreground (see live logs)
docker compose up --build

# Start in the background (detached)
docker compose up -d --build

# Stop and remove containers (job store is kept)
docker compose down

# Stop, remove containers AND delete the job store
docker compose down -v

# View logs for a specific service
docker compose logs backend
docker compose logs frontend
docker compose logs -f backend    # follow (live tail)

# Rebuild after changing code
docker compose up --build

# Rebuild a single service
docker compose up --build backend

# Check running containers
docker ps

# Inspect the job store volume
docker volume inspect bulk-crib_backend_data

# Full reset (remove containers, networks, and rebuild from scratch)
docker compose down
docker compose build --no-cache
docker compose up
```

---

## Troubleshooting

### Docker refuses to start: "This machine is required to be signed in while using Docker Desktop"
**Fix:** Open Docker Desktop and click **Sign in** (top right), or run `docker login` in the terminal. Use your organisation's account if sign-in is enforced by IT. Then run `docker compose up --build` again.

### Port already in use
**Symptom:** Error like `port is already allocated` on 3000 or 8000.
**Fix:** Stop whatever is using that port, or change the host-side port in `docker-compose.yml` (e.g., `"3001:80"`) and access via the new port.

### Frontend loads but shows "Backend unreachable" or CORS errors
**Fix:** Confirm the backend is running (`http://localhost:8000/api/health` should respond). If the UI is served from a different host or port than `localhost:3000`, add that origin to `ALLOWED_ORIGINS` in `docker-compose.yml` and restart.

### MySQL: "connection failed … Can't connect to MySQL server on 'localhost'"
**Cause:** Inside Docker, `localhost` is the backend container itself.
**Fix:** Use `host.docker.internal` as the host for a MySQL server on this computer. For a remote server, check hostname, port, firewall and that the user is allowed to connect from this machine's address (`GRANT … TO 'user'@'%'` or the specific host).

### MySQL: "Access denied" or "Table … doesn't exist"
**Fix:** Verify the database and table names (case-sensitive on Linux servers) and that the user has `SELECT` on the table. Use `schema.table` if the table is in a different schema than the one entered as Database.

### "Column(s) not found in source"
**Fix:** The mapping refers to a column that is not in the file/table. Re-run Step 1 and pick the columns from the drop-downs; column names are matched exactly, including spaces and case.

### Many rows dropped as "invalid type"
**Fix:** The type column must contain `P` or `N` (case-insensitive). Check the status filter in the **ID changes** tab to see the exact values that were rejected, and map a different column if necessary.

### "File has N rows; the limit is 1,000,000"
**Fix:** Split the source, filter it with a MySQL view, or raise `MAX_SOURCE_ROWS` in `docker-compose.yml` (needs enough memory in the backend container).

### History is empty after restarting
**Cause:** `docker compose down -v` deletes the `backend_data` volume, and with it every stored job.
**Fix:** Use `docker compose down` (without `-v`) for routine restarts. Restore from a backup if you have one (see [Storage & Retention](#storage--retention)).

### Docker build is very slow or fails on dependency install
**Fix:** Ensure a stable internet connection (build downloads Python/Node packages). Try `docker compose build --no-cache` for a clean retry.

### Changes to code aren't reflected
**Fix:** Code is copied into the image at build time — always run `docker compose up --build` after editing the backend or frontend, not just `docker compose up`.

---

## Configuration

### Environment variables (backend)
Set in the `environment:` block of the `backend` service in `docker-compose.yml`.

| Variable | Default | Purpose |
|---|---|---|
| `RETENTION_DAYS` | `365` | Days a processed job is kept before automatic deletion |
| `CLEANUP_INTERVAL_HOURS` | `24` | How often the expiry cleanup runs (it also runs at startup) |
| `DATA_DIR` | `/app/data` | Directory holding the SQLite store `bulkcrib.db` (mapped to the `backend_data` volume) |
| `MAX_SOURCE_ROWS` | `1000000` | Sources with more rows are rejected |
| `ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:5173` | Comma-separated frontend origins allowed to call the API (CORS) |

### Changing ports
Edit `docker-compose.yml`:
```yaml
services:
  backend:
    ports:
      - "8000:8000"   # change the left-hand (host) port only
  frontend:
    ports:
      - "3000:80"     # change the left-hand (host) port only
```
If you change the backend host port, or serve the UI from another machine, rebuild the frontend with the backend URL set:
```yaml
  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_URL: http://your-server:8000
```
and add the matching UI origin to `ALLOWED_ORIGINS`. (The frontend defaults to `http://localhost:8000`.)

### Chunk size for output files
In `backend/main.py`:
```python
CHUNK_SIZE = 10000  # records per output CSV file
```

---

## Running Without Docker (Development)

Backend (Python 3.11+ recommended):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000                  # store is created in backend/data/
```

Frontend (Node 20+):
```bash
cd frontend
npm install
npm run dev                                            # http://localhost:3000, hot reload
```
The dev server on port 3000 is already in the default `ALLOWED_ORIGINS`.

---

## Support

**AI & Data Science Unit**
**Commercial Bank of Ceylon**

For issues:
1. Check the [Troubleshooting](#troubleshooting) section above
2. Check container logs: `docker compose logs backend` / `docker compose logs frontend`
3. Confirm both health checks respond (`/api/health` and `http://localhost:3000`)
4. Contact the AI & Data Science Unit with the error message and steps to reproduce

---

**Version:** 4.0
**Last Updated:** September 2026

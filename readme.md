# Excel ID Processor (BulkCrib)

**By AI & Data Science Unit — Commercial Bank of Ceylon**

A dockerized web application that cleans, validates, and formats customer ID numbers from Excel files, splitting them into Personal (Consumer) and Corporate records ready for bulk credit report submission.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Prerequisites](#prerequisites)
3. [Project Structure](#project-structure)
4. [Quick Start](#quick-start)
5. [Usage](#usage)
6. [Features](#features)
7. [Excel File Requirements](#excel-file-requirements)
8. [API Reference](#api-reference)
9. [Common Commands](#common-commands)
10. [Troubleshooting](#troubleshooting)
11. [Configuration](#configuration)
12. [Support](#support)

---

## Architecture

```
┌─────────────────────┐         ┌──────────────────────┐
│   React Frontend     │  HTTP   │   FastAPI Backend     │
│   (nginx)            │ ──────► │   (uvicorn)           │
│   localhost:3000      │         │   localhost:8000       │
└─────────────────────┘         └──────────────────────┘
     Docker container                Docker container
```

- **Frontend**: React (built with Vite), served as static files via nginx
- **Backend**: FastAPI (Python), handles all Excel processing logic
- **Communication**: Frontend calls backend via REST API (`fetch`), both exposed on separate host ports
- **Storage**: Processed files are kept in backend memory per job (no database required)

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Docker Desktop | Latest | Includes Docker Compose. [Download here](https://www.docker.com/products/docker-desktop/) |
| Windows | 10/11 (64-bit) | WSL2 backend recommended for Docker Desktop |
| Free disk space | ~2 GB | For Docker images and build cache |
| Free ports | 3000, 8000 | Must not be in use by other applications |

No local Python or Node.js installation is required — everything runs inside containers.

---

## Project Structure

```
BulkCrib/
├── docker-compose.yml
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── requirements.txt
│   └── main.py
└── frontend/
    ├── Dockerfile
    ├── .dockerignore
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        └── App.jsx
```

---

## Quick Start

1. **Open PowerShell or Command Prompt** and navigate to the project folder:
   ```powershell
   cd "D:\CBC Tech Solutions\BulkCrib"
   ```

2. **Build and start both containers:**
   ```powershell
   docker compose up --build
   ```
   First build takes 3–5 minutes (downloads base images, installs dependencies).

3. **Open the application:**
   - Frontend (UI): [http://localhost:3000](http://localhost:3000)
   - Backend health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)
   - API documentation (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)

4. **Stop the application** when done (press `Ctrl+C`, then):
   ```powershell
   docker compose down
   ```

---

## Usage

1. **Upload** — Drag and drop, or click to browse, for an Excel file (`.xlsx` or `.xls`)
2. **Review** — The app analyzes the file and shows row count, column check, and a data preview
3. **Process** — Click "🔄 Process File" to run the cleaning and classification engine
4. **Review Results** — Explore the dashboard tabs:
   - **Summary** — record counts, corporate/consumer split, NIC/Passport breakdown
   - **Comparison** — uploaded vs. output reconciliation, with a pass/fail banner
   - **Changed IDs** — side-by-side original vs. cleaned ID numbers
   - **Duplicates** — flags IDs that collapse to the same value after cleaning
5. **Download** — Click "⬇️ Download ZIP" to save the processed CSV files

---

## Features

### Core Processing
- Removes special characters (`/`, `(`, `)`, `\`, spaces, commas, periods) from ID numbers
- Splits records into **Corporate** (`N`) and **Consumer** (`P`) categories
- Assigns ID types: `BusinessRegistrationNumber` (corporate), `NIC` or `PassportNumber` (consumer, based on first character)
- Chunks large output files into batches of 10,000 records
- Generates change-tracking files for any ID numbers that were modified

### Enhanced Features (v3.0)
- **Upload vs. output comparison** — reconciles record counts and flags dropped records (empty IDs, invalid type values)
- **Duplicate detection** — identifies IDs that become identical after cleaning (e.g., `123 456` and `123456`)
- **Interactive dashboard** — tabbed summary, comparison, changes, and duplicates views
- **Job-based downloads** — processing and downloading are separate steps; results are held server-side until requested

---

## Excel File Requirements

Your Excel file **must** contain these two columns (exact names, case-sensitive):

| Column Name | Description | Valid Values |
|---|---|---|
| `ID_NUMBER` | Customer identification number | Any alphanumeric string |
| `PERSONAL_NONPERSONAL` | Customer type indicator | `P` (Personal) or `N` (Corporate) |

- Headers must be in row 1; data starts in row 2
- Additional columns are ignored (not removed from your original file — the app only reads it)
- Supported formats: `.xlsx`, `.xls`
- Recommended limit: under 100,000 rows for reasonable processing time

A ready-made test file can be generated with the provided `create_sample.py` script (see previous project notes) to validate all dashboard tabs.

---

## API Reference

Base URL: `http://localhost:8000`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check, returns `{"status": "healthy"}` |
| `POST` | `/api/analyze` | Upload a file for validation/preview only (no processing) |
| `POST` | `/api/process` | Upload and fully process a file; returns `job_id` and summary statistics |
| `GET` | `/api/download/{job_id}` | Download the ZIP of processed CSV files for a given job |

Full interactive documentation with request/response schemas is available at [http://localhost:8000/docs](http://localhost:8000/docs) once the backend is running.

**Note:** Processed jobs are stored in backend memory only. The 20 most recent jobs are kept; older ones are discarded, and all jobs are lost if the backend container restarts. Download promptly after processing.

---

## Common Commands

```powershell
# Start in the foreground (see live logs)
docker compose up --build

# Start in the background (detached)
docker compose up -d --build

# Stop and remove containers
docker compose down

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

# Full reset (remove containers, networks, and rebuild from scratch)
docker compose down
docker compose build --no-cache
docker compose up
```

---

## Troubleshooting

### Port already in use
**Symptom:** Error like `port is already allocated` on 3000 or 8000.
**Fix:** Stop whatever is using that port, or change the host-side port in `docker-compose.yml` (e.g., `"3001:80"`) and access via the new port.

### Frontend loads but shows network/CORS errors
**Symptom:** UI loads, but upload/process fails with a fetch or CORS error.
**Fix:** Confirm the backend is running (`http://localhost:8000/api/health` should respond). Check that `main.py`'s CORS `allow_origins` includes the frontend's actual URL/port.

### "Missing required columns" error
**Symptom:** Analysis step fails even though your file looks correct.
**Fix:** Check for extra spaces in column headers, verify exact spelling (`ID_NUMBER`, `PERSONAL_NONPERSONAL`), and confirm headers are in row 1.

### Download fails with "Job not found or expired"
**Symptom:** Clicking download after some time returns a 404.
**Fix:** Backend was likely restarted, or the job aged out (only 20 most recent are kept). Re-upload and reprocess the file.

### Docker build is very slow or fails on dependency install
**Fix:** Ensure a stable internet connection (build downloads Python/Node packages). Try `docker compose build --no-cache` for a clean retry.

### Changes to code aren't reflected
**Fix:** Code is copied into the image at build time — always run `docker compose up --build` after editing `main.py` or `App.jsx`, not just `docker compose up`.

---

## Configuration

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
If you change the backend host port, also update the `API` constant in `frontend/src/App.jsx` to match, then rebuild.

### CORS (allowed frontend origins)
In `backend/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    ...
)
```
Add any additional origin (e.g., a server hostname) here if deploying beyond localhost.

### Chunk size for output files
In `backend/main.py`, inside `finalize_and_chunk`:
```python
chunk_size = 10000  # adjust records per output CSV file
```

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

**Version:** 3.0
**Last Updated:** December 2024
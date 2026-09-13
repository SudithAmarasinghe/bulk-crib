from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import zipfile
import uuid
from datetime import datetime
import warnings

warnings.filterwarnings("ignore")

app = FastAPI(title="Excel ID Processor API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job storage: {job_id: {"zip": bytes, "summary": dict, "created": datetime}}
JOBS = {}

SPECIAL_CHARS = ['/', '(', ')', '\\', ' ', ',', '.']


def clean_id_number(id_value):
    """Clean ID number by removing special characters consistently."""
    if pd.isna(id_value):
        return ''
    id_str = str(id_value).strip()
    for char in SPECIAL_CHARS:
        id_str = id_str.replace(char, '')
    return id_str


def determine_id_type(id_number):
    s = str(id_number).strip()
    if not s:
        return 'NIC'
    return 'PassportNumber' if s[0].isalpha() else 'NIC'


def get_date():
    return datetime.today().strftime('%d%m%y')


def process_dataframe(df):
    """
    Core processing engine.
    Returns (files: dict[filename -> DataFrame], summary: dict)
    """
    date_str = get_date()
    files = {}

    # ---------- Input statistics ----------
    total_uploaded = len(df)

    df = df.filter(['ID_NUMBER', 'PERSONAL_NONPERSONAL'], axis=1)

    # Empty / missing IDs
    df = df.dropna(subset=['ID_NUMBER'])
    df = df[df['ID_NUMBER'].astype(str).str.strip() != '']
    empty_removed = total_uploaded - len(df)

    # Invalid type values (not P or N)
    df['PERSONAL_NONPERSONAL'] = df['PERSONAL_NONPERSONAL'].astype(str).str.strip().str.upper()
    invalid_type_df = df[~df['PERSONAL_NONPERSONAL'].isin(['P', 'N'])]
    invalid_type_count = len(invalid_type_df)
    df = df[df['PERSONAL_NONPERSONAL'].isin(['P', 'N'])]

    if df.empty:
        raise ValueError("No valid data found after cleaning")

    # ---------- Change tracking ----------
    df['Original_ID'] = df['ID_NUMBER'].astype(str).str.strip()
    df['Cleaned_ID'] = df['ID_NUMBER'].apply(clean_id_number)

    changed = df[df['Original_ID'] != df['Cleaned_ID']].copy()
    changes_list = [
        {
            "original": row['Original_ID'],
            "cleaned": row['Cleaned_ID'],
            "type": "Personal" if row['PERSONAL_NONPERSONAL'] == 'P' else "Corporate",
        }
        for _, row in changed.iterrows()
    ]

    changed_export = changed[['Original_ID', 'Cleaned_ID', 'PERSONAL_NONPERSONAL']].rename(
        columns={'Original_ID': 'Original_ID_NUMBER', 'Cleaned_ID': 'New_ID_NUMBER'}
    )
    ch_p = changed_export[changed_export['PERSONAL_NONPERSONAL'] == 'P']
    ch_n = changed_export[changed_export['PERSONAL_NONPERSONAL'] == 'N']
    if not ch_p.empty:
        files[f"consumer_updated_ids_{date_str}.csv"] = ch_p
    if not ch_n.empty:
        files[f"corporate_updated_ids_{date_str}.csv"] = ch_n

    # ---------- Duplicate detection (after cleaning) ----------
    dup_mask = df.duplicated(subset=['Cleaned_ID'], keep=False)
    duplicates = df[dup_mask]
    duplicate_ids = sorted(duplicates['Cleaned_ID'].unique().tolist())
    duplicate_count = len(duplicates)

    # ---------- Build output records ----------
    df['IDNumber'] = df['Cleaned_ID']
    df['SubjectType'] = df['PERSONAL_NONPERSONAL'].replace({'P': 'Individual', 'N': 'Company'})
    df['RequestedReport'] = 'CreditinfoReport'

    df_corp = df[df['SubjectType'] == 'Company'].copy()
    df_cons = df[df['SubjectType'] == 'Individual'].copy()

    # Corporate
    if not df_corp.empty:
        df_corp['IDNumberType'] = 'BusinessRegistrationNumber'

    # Consumer
    nic_count = passport_count = 0
    if not df_cons.empty:
        df_cons = df_cons.sort_values('IDNumber').reset_index(drop=True)
        df_cons['IDNumberType'] = df_cons['IDNumber'].apply(determine_id_type)
        nic_count = int((df_cons['IDNumberType'] == 'NIC').sum())
        passport_count = int((df_cons['IDNumberType'] == 'PassportNumber').sum())

    def finalize_and_chunk(d, type_name):
        if d.empty:
            return 0
        out = d[['IDNumberType', 'IDNumber', 'RequestedReport', 'SubjectType']].copy()
        out[''] = ''
        out['_'] = ''
        chunk_size = 10000
        chunk_count = 0
        for i in range(0, len(out), chunk_size):
            chunk = out[i:i + chunk_size].map(lambda x: str(x).strip() if pd.notna(x) else '')
            files[f'{type_name}_Bulk{(i // chunk_size) + 1}_{date_str}.csv'] = chunk
            chunk_count += 1
        return chunk_count

    corp_chunks = finalize_and_chunk(df_corp, 'Corporate')
    cons_chunks = finalize_and_chunk(df_cons, 'Consumer')

    # ---------- Comparison summary (uploaded vs created) ----------
    total_output = len(df_corp) + len(df_cons)
    summary = {
        "input": {
            "total_uploaded": int(total_uploaded),
            "empty_removed": int(empty_removed),
            "invalid_type_removed": int(invalid_type_count),
            "valid_records": int(len(df)),
        },
        "output": {
            "total_output_records": int(total_output),
            "corporate_records": int(len(df_corp)),
            "consumer_records": int(len(df_cons)),
            "nic_count": nic_count,
            "passport_count": passport_count,
            "corporate_files": corp_chunks,
            "consumer_files": cons_chunks,
            "total_files": len(files),
        },
        "comparison": {
            "records_match": int(total_output) == int(total_uploaded) - int(empty_removed) - int(invalid_type_count),
            "records_dropped": int(total_uploaded) - int(total_output),
            "ids_changed": len(changes_list),
            "change_rate_percent": round(len(changes_list) / len(df) * 100, 2) if len(df) else 0,
        },
        "changes": changes_list[:500],  # cap for UI performance
        "changes_truncated": len(changes_list) > 500,
        "duplicates": {
            "duplicate_record_count": int(duplicate_count),
            "unique_duplicate_ids": duplicate_ids[:200],
        },
        "processed_at": datetime.now().isoformat(),
    }

    return files, summary


def build_zip(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for name, dataframe in files.items():
            csv_buf = io.StringIO()
            dataframe.to_csv(csv_buf, index=False)
            zf.writestr(name, csv_buf.getvalue())
    buf.seek(0)
    return buf.read()


# ---------------- API endpoints ----------------

@app.get("/api/health")
async def health():
    return {"status": "healthy", "version": "3.0"}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """Validate file and return preview info before processing."""
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "File must be .xlsx or .xls")
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        required = ['ID_NUMBER', 'PERSONAL_NONPERSONAL']
        missing = [c for c in required if c not in df.columns]
        return {
            "filename": file.filename,
            "total_rows": len(df),
            "columns": list(df.columns),
            "required_columns_present": not missing,
            "missing_columns": missing,
            "preview": df[required].head(5).fillna('').astype(str).to_dict('records') if not missing else [],
        }
    except Exception as e:
        raise HTTPException(500, f"Error reading file: {e}")


@app.post("/api/process")
async def process(file: UploadFile = File(...)):
    """Process the file. Returns job_id + full comparison summary."""
    if not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(400, "File must be .xlsx or .xls")
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))

        missing = [c for c in ['ID_NUMBER', 'PERSONAL_NONPERSONAL'] if c not in df.columns]
        if missing:
            raise HTTPException(400, f"Missing required columns: {missing}")

        files, summary = process_dataframe(df)
        zip_bytes = build_zip(files)

        job_id = str(uuid.uuid4())
        JOBS[job_id] = {"zip": zip_bytes, "summary": summary, "created": datetime.now()}

        # Simple cleanup: keep only 20 most recent jobs
        if len(JOBS) > 20:
            oldest = sorted(JOBS, key=lambda k: JOBS[k]["created"])[0]
            del JOBS[oldest]

        return {"job_id": job_id, "summary": summary, "file_list": list(files.keys())}

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"Processing error: {e}")


@app.get("/api/download/{job_id}")
async def download(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found or expired. Please process again.")
    return StreamingResponse(
        io.BytesIO(job["zip"]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="processed_files_{get_date()}.zip"'},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
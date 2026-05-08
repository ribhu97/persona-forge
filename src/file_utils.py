"""
File upload utilities: validation, processing, and Gemini File API lifecycle management.

Security model:
- All files are validated by magic bytes (not just extension) before processing.
- Extracted text is stored server-side; clients receive only a file_id.
- Gemini file URIs are never exposed to clients.
- All parsing is wrapped in timeouts to prevent DoS via crafted files.
- DOCX zip bombs are caught by entry count + uncompressed size limits.
"""
import asyncio
import logging
import os
import tempfile
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import filetype
from fastapi import HTTPException, UploadFile

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

FILE_UPLOAD_TTL_HOURS = 1
CHAR_BUDGET = 50_000  # Max chars of extracted text passed to the model
PARSE_TIMEOUT_S = 30

# Tier size limits (bytes)
TIER_SIZE_LIMITS = {
    0: 5 * 1024 * 1024,    # Free: 5 MB
    1: 25 * 1024 * 1024,   # Plus: 25 MB
    2: 100 * 1024 * 1024,  # Pro: 100 MB
    99: 100 * 1024 * 1024, # Admin: 100 MB
}

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
    "text/markdown",
}

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "webp", "docx", "txt", "md"}

EXTENSION_TO_FILE_TYPE = {
    "pdf": "pdf",
    "png": "png",
    "jpg": "jpg",
    "jpeg": "jpg",
    "webp": "webp",
    "docx": "docx",
    "txt": "txt",
    "md": "md",
}

# Magic byte types that have no reliable signatures (TXT/MD) — skip magic byte check
MAGIC_BYTE_EXEMPT = {"txt", "md"}

# DOCX zip safety limits
DOCX_MAX_ENTRIES = 1000
DOCX_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024  # 200 MB
DOCX_MAX_SINGLE_ENTRY_BYTES = 50 * 1024 * 1024    # 50 MB

# PDF limits
PDF_MAX_PAGES = 500


# ── Validation ────────────────────────────────────────────────────────────────

def get_file_extension(filename: str) -> str:
    return Path(filename).suffix.lstrip(".").lower()


def validate_extension(filename: str) -> str:
    """Return normalised file_type string or raise 415."""
    ext = get_file_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    return EXTENSION_TO_FILE_TYPE[ext]


def validate_magic_bytes(data: bytes, file_type: str) -> None:
    """Check magic bytes match the declared file type. TXT/MD are exempt."""
    if file_type in MAGIC_BYTE_EXEMPT:
        return

    kind = filetype.guess(data)
    if kind is None:
        raise HTTPException(
            status_code=415,
            detail="Could not determine file type from content. File may be corrupt or unsupported.",
        )

    # DOCX files are ZIP archives; filetype detects them as application/zip.
    # Accept either the Office MIME or the zip MIME for the docx path.
    docx_mimes = {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/zip",
    }
    if file_type == "docx":
        if kind.mime not in docx_mimes:
            raise HTTPException(
                status_code=415,
                detail=f"File content does not appear to be a valid DOCX.",
            )
        return

    if kind.mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"File content type '{kind.mime}' does not match the allowed types.",
        )

    # Verify declared type matches detected type
    detected_ext = kind.extension
    if file_type == "jpg" and detected_ext in ("jpg", "jpeg"):
        return
    if file_type != detected_ext:
        raise HTTPException(
            status_code=415,
            detail=f"File extension claims '{file_type}' but content looks like '{detected_ext}'.",
        )


def validate_size(size: int, account_type: int) -> None:
    limit = TIER_SIZE_LIMITS.get(account_type, TIER_SIZE_LIMITS[0])
    if size > limit:
        limit_mb = limit // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({size // 1024 // 1024} MB). Your plan allows up to {limit_mb} MB.",
        )


def validate_txt_content(data: bytes) -> str:
    """Validate and decode plaintext. Reject binary masquerading as text."""
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=422,
            detail="File is not valid UTF-8. Only UTF-8 encoded text files are supported.",
        )
    if "\x00" in text:
        raise HTTPException(
            status_code=422,
            detail="File contains null bytes and cannot be processed as text.",
        )
    # Reject lines that are suspiciously large (> 1 MB per line)
    for line in text.splitlines():
        if len(line) > 1_000_000:
            raise HTTPException(
                status_code=422,
                detail="File contains lines that are too long to process.",
            )
    return text


def validate_docx_zip(data: bytes, size_limit: int) -> None:
    """Check DOCX zip for bomb conditions before extraction."""
    try:
        import io
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            infos = zf.infolist()
            if len(infos) > DOCX_MAX_ENTRIES:
                raise HTTPException(
                    status_code=422,
                    detail=f"DOCX contains too many entries ({len(infos)}). File may be malformed.",
                )
            total_uncompressed = 0
            for info in infos:
                if info.file_size > DOCX_MAX_SINGLE_ENTRY_BYTES:
                    raise HTTPException(
                        status_code=422,
                        detail="DOCX contains an entry that exceeds the maximum allowed size.",
                    )
                total_uncompressed += info.file_size
            if total_uncompressed > DOCX_MAX_UNCOMPRESSED_BYTES:
                raise HTTPException(
                    status_code=422,
                    detail="DOCX uncompressed size is too large.",
                )
            # Also check against tier limit
            if total_uncompressed > size_limit:
                size_limit_mb = size_limit // (1024 * 1024)
                raise HTTPException(
                    status_code=413,
                    detail=f"DOCX content exceeds your plan's {size_limit_mb} MB limit.",
                )
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=422,
            detail="DOCX file is corrupt or not a valid Office document.",
        )


# ── Text extraction ───────────────────────────────────────────────────────────

async def _extract_with_timeout(coro, timeout: int = PARSE_TIMEOUT_S):
    """Run a coroutine with a timeout, raising 422 on timeout."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=422,
            detail="File processing timed out. The file may be too complex or malformed.",
        )


async def extract_pdf_text(tmp_path: str) -> tuple[str, list[str]]:
    """Extract text from PDF using PyMuPDF. Returns (text, warnings)."""
    import fitz  # PyMuPDF

    async def _do_extract():
        warnings = []
        try:
            doc = fitz.open(tmp_path)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not open PDF: {e}")

        if doc.needs_pass:
            raise HTTPException(
                status_code=422,
                detail="PDF is password-protected and cannot be processed.",
            )

        page_count = len(doc)
        if page_count > PDF_MAX_PAGES:
            warnings.append(f"PDF has {page_count} pages; only the first {PDF_MAX_PAGES} were processed.")
            page_count = PDF_MAX_PAGES

        texts = []
        for i in range(page_count):
            texts.append(doc[i].get_text())

        doc.close()
        full_text = "\n".join(texts).strip()

        if not full_text:
            warnings.append(
                "No extractable text found. The PDF may be scanned or image-only. "
                "Gemini will attempt to read it visually."
            )
        return full_text, warnings

    return await _extract_with_timeout(_do_extract())


async def extract_docx_text(tmp_path: str) -> tuple[str, list[str]]:
    """Extract text from DOCX using python-docx."""
    import docx

    async def _do_extract():
        warnings = []
        try:
            doc = docx.Document(tmp_path)
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not open DOCX: {e}")
        text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        return text.strip(), warnings

    return await _extract_with_timeout(_do_extract())


def apply_char_budget(text: str, file_type: str) -> tuple[str, bool, list[str]]:
    """Truncate text to CHAR_BUDGET. Returns (text, truncated, warnings)."""
    if len(text) <= CHAR_BUDGET:
        return text, False, []
    truncated_text = text[:CHAR_BUDGET]
    warnings = [
        f"Only the first {CHAR_BUDGET:,} characters of your {file_type.upper()} were used "
        f"(document contained {len(text):,} characters)."
    ]
    return truncated_text, True, warnings


# ── Gemini File API ───────────────────────────────────────────────────────────

async def upload_to_gemini(data: bytes, filename: str, mime_type: str) -> Optional[str]:
    """Upload file to Gemini File API. Returns file_uri or None on failure."""
    import io
    from google import genai

    try:
        client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
        file_obj = io.BytesIO(data)
        file_obj.name = filename
        response = client.files.upload(file=file_obj, config={"mime_type": mime_type})
        return response.uri
    except Exception as e:
        logger.warning("Gemini File API upload failed for %s: %s", filename, e)
        return None


def cleanup_gemini_file(file_uri: str) -> None:
    """Best-effort delete of a Gemini File API file. Logs failure; does not raise."""
    from google import genai

    try:
        client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
        # Extract file name from URI: files/abc123
        file_name = file_uri.split("/files/")[-1] if "/files/" in file_uri else file_uri
        client.files.delete(name=f"files/{file_name}")
        logger.info("Deleted Gemini file: %s", file_uri)
    except Exception as e:
        logger.warning(
            "Failed to delete Gemini file %s (will expire within 48h): %s", file_uri, e
        )


# ── Main processing entry point ───────────────────────────────────────────────

async def process_uploaded_file(
    upload: UploadFile,
    account_type: int,
) -> dict:
    """
    Validate and process an uploaded file.

    Returns a dict with:
        file_type, original_filename, file_size,
        gemini_file_uri (optional), extracted_text (optional),
        extracted_char_count, truncated, warnings
    """
    filename = upload.filename or "upload"
    file_type = validate_extension(filename)
    data = await upload.read()
    file_size = len(data)

    # Size check
    validate_size(file_size, account_type)

    # Magic byte check
    validate_magic_bytes(data, file_type)

    warnings: list[str] = []
    extracted_text: Optional[str] = None
    gemini_file_uri: Optional[str] = None
    truncated = False

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = os.path.join(tmp_dir, filename)
        with open(tmp_path, "wb") as f:
            f.write(data)

        if file_type == "pdf":
            # DOCX-style zip check doesn't apply; PDF has its own page limit
            extracted, pdf_warnings = await extract_pdf_text(tmp_path)
            warnings.extend(pdf_warnings)
            if extracted:
                extracted_text, truncated, budget_warnings = apply_char_budget(extracted, file_type)
                warnings.extend(budget_warnings)
            # Always try Gemini upload for PDFs (native understanding > text extraction)
            gemini_file_uri = await upload_to_gemini(data, filename, "application/pdf")

        elif file_type in ("png", "jpg", "webp"):
            mime_map = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp"}
            gemini_file_uri = await upload_to_gemini(data, filename, mime_map[file_type])
            if not gemini_file_uri:
                warnings.append(
                    "Image could not be uploaded for AI processing. "
                    "If using Groq fallback, this image will be skipped."
                )

        elif file_type == "docx":
            size_limit = TIER_SIZE_LIMITS.get(account_type, TIER_SIZE_LIMITS[0])
            validate_docx_zip(data, size_limit)
            extracted, docx_warnings = await extract_docx_text(tmp_path)
            warnings.extend(docx_warnings)
            if extracted:
                extracted_text, truncated, budget_warnings = apply_char_budget(extracted, file_type)
                warnings.extend(budget_warnings)

        elif file_type in ("txt", "md"):
            raw_text = validate_txt_content(data)
            extracted_text, truncated, budget_warnings = apply_char_budget(raw_text, file_type)
            warnings.extend(budget_warnings)

    return {
        "file_type": file_type,
        "original_filename": filename,
        "file_size": file_size,
        "gemini_file_uri": gemini_file_uri,
        "extracted_text": extracted_text,
        "extracted_char_count": len(extracted_text) if extracted_text else None,
        "truncated": truncated,
        "warnings": warnings,
    }


# ── Startup cleanup ───────────────────────────────────────────────────────────

def sweep_expired_uploads(session) -> None:
    """
    Delete Gemini files and mark DB records expired for:
    - Records past their expires_at
    - Records with status='used' (already consumed by generation)

    Called on app startup to handle records orphaned by crashes.
    """
    from sqlmodel import select
    from src.models import UploadedFile

    now = datetime.now(timezone.utc)
    stmt = select(UploadedFile).where(
        (UploadedFile.expires_at < now) | (UploadedFile.status == "used")
    )
    records = session.exec(stmt).all()
    for record in records:
        if record.gemini_file_uri and record.status != "expired":
            cleanup_gemini_file(record.gemini_file_uri)
        record.status = "expired"
        session.add(record)
    if records:
        session.commit()
        logger.info("Startup sweep: expired %d uploaded file record(s).", len(records))

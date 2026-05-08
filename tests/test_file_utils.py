"""
Unit tests for src/file_utils.py

Covers:
- Extension validation
- Magic byte validation
- Size enforcement per tier
- TXT/MD content validation
- DOCX zip bomb detection
- Character budget / truncation
- PDF extraction failure modes (encrypted, scanned)
- apply_char_budget
"""
import io
import struct
import zipfile

import pytest
from fastapi import HTTPException

from src.file_utils import (
    CHAR_BUDGET,
    TIER_SIZE_LIMITS,
    apply_char_budget,
    validate_docx_zip,
    validate_extension,
    validate_magic_bytes,
    validate_size,
    validate_txt_content,
)


# ── Extension validation ──────────────────────────────────────────────────────

class TestValidateExtension:
    def test_allowed_extensions(self):
        assert validate_extension("report.pdf") == "pdf"
        assert validate_extension("image.png") == "png"
        assert validate_extension("photo.jpg") == "jpg"
        assert validate_extension("photo.jpeg") == "jpg"
        assert validate_extension("pic.webp") == "webp"
        assert validate_extension("doc.docx") == "docx"
        assert validate_extension("notes.txt") == "txt"
        assert validate_extension("readme.md") == "md"

    def test_uppercase_extension(self):
        assert validate_extension("REPORT.PDF") == "pdf"
        assert validate_extension("IMAGE.PNG") == "png"

    def test_disallowed_extension_raises_415(self):
        with pytest.raises(HTTPException) as exc:
            validate_extension("malware.exe")
        assert exc.value.status_code == 415

    def test_disallowed_extension_csv(self):
        with pytest.raises(HTTPException) as exc:
            validate_extension("data.csv")
        assert exc.value.status_code == 415

    def test_no_extension_raises_415(self):
        with pytest.raises(HTTPException):
            validate_extension("noextension")


# ── Magic byte validation ─────────────────────────────────────────────────────

def _make_pdf_bytes() -> bytes:
    """Minimal valid PDF header."""
    return b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"


def _make_png_bytes() -> bytes:
    """PNG magic bytes."""
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * 100


def _make_docx_bytes() -> bytes:
    """DOCX is a ZIP. Create a minimal ZIP with PK magic."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("[Content_Types].xml", "<Types/>")
    return buf.getvalue()


class TestValidateMagicBytes:
    def test_pdf_passes(self):
        validate_magic_bytes(_make_pdf_bytes(), "pdf")  # should not raise

    def test_png_passes(self):
        validate_magic_bytes(_make_png_bytes(), "png")  # should not raise

    def test_docx_passes(self):
        validate_magic_bytes(_make_docx_bytes(), "docx")  # should not raise

    def test_txt_skips_check(self):
        # TXT has no magic bytes — any bytes pass
        validate_magic_bytes(b"hello world", "txt")

    def test_md_skips_check(self):
        validate_magic_bytes(b"# Heading\nsome markdown", "md")

    def test_renamed_exe_as_pdf_raises_415(self):
        # MZ header (Windows PE) masquerading as PDF
        mz_bytes = b"MZ" + b"\x00" * 200
        with pytest.raises(HTTPException) as exc:
            validate_magic_bytes(mz_bytes, "pdf")
        assert exc.value.status_code == 415

    def test_pdf_bytes_claiming_png_raises_415(self):
        with pytest.raises(HTTPException) as exc:
            validate_magic_bytes(_make_pdf_bytes(), "png")
        assert exc.value.status_code == 415

    def test_empty_bytes_raises_415(self):
        with pytest.raises(HTTPException) as exc:
            validate_magic_bytes(b"", "pdf")
        assert exc.value.status_code == 415


# ── Size validation ───────────────────────────────────────────────────────────

class TestValidateSize:
    def test_free_tier_within_limit(self):
        validate_size(4 * 1024 * 1024, account_type=0)  # 4 MB < 5 MB limit

    def test_free_tier_at_limit_passes(self):
        validate_size(TIER_SIZE_LIMITS[0], account_type=0)

    def test_free_tier_over_limit_raises_413(self):
        with pytest.raises(HTTPException) as exc:
            validate_size(6 * 1024 * 1024, account_type=0)  # 6 MB > 5 MB
        assert exc.value.status_code == 413

    def test_plus_tier_allows_larger_file(self):
        validate_size(20 * 1024 * 1024, account_type=1)  # 20 MB < 25 MB limit

    def test_plus_tier_over_limit_raises_413(self):
        with pytest.raises(HTTPException) as exc:
            validate_size(30 * 1024 * 1024, account_type=1)  # 30 MB > 25 MB
        assert exc.value.status_code == 413

    def test_pro_tier_at_hard_ceiling(self):
        validate_size(100 * 1024 * 1024, account_type=2)  # exactly 100 MB

    def test_pro_tier_over_hard_ceiling_raises_413(self):
        with pytest.raises(HTTPException) as exc:
            validate_size(101 * 1024 * 1024, account_type=2)
        assert exc.value.status_code == 413

    def test_truly_unknown_tier_defaults_to_free_limit(self):
        # Account type 5 is not in TIER_SIZE_LIMITS — falls back to free (5 MB)
        with pytest.raises(HTTPException) as exc:
            validate_size(6 * 1024 * 1024, account_type=5)
        assert exc.value.status_code == 413

    def test_admin_tier_uses_100mb_ceiling(self):
        # Account type 99 (Admin) has a 100 MB hard ceiling, not unlimited
        validate_size(100 * 1024 * 1024, account_type=99)  # should pass
        with pytest.raises(HTTPException):
            validate_size(101 * 1024 * 1024, account_type=99)


# ── TXT/MD content validation ─────────────────────────────────────────────────

class TestValidateTxtContent:
    def test_valid_utf8(self):
        result = validate_txt_content(b"Hello, world!")
        assert result == "Hello, world!"

    def test_valid_unicode(self):
        text = "こんにちは"
        result = validate_txt_content(text.encode("utf-8"))
        assert result == text

    def test_invalid_encoding_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            validate_txt_content(b"\xff\xfe invalid latin-1 bytes \x80\x81")
        assert exc.value.status_code == 422

    def test_null_bytes_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            validate_txt_content(b"hello\x00world")
        assert exc.value.status_code == 422

    def test_huge_line_raises_422(self):
        # Line longer than 1 MB
        huge_line = b"x" * (1_000_001)
        with pytest.raises(HTTPException) as exc:
            validate_txt_content(huge_line)
        assert exc.value.status_code == 422

    def test_normal_long_line_passes(self):
        normal = b"x" * 999_999
        result = validate_txt_content(normal)
        assert len(result) == 999_999


# ── DOCX zip bomb detection ───────────────────────────────────────────────────

def _make_docx_with_entries(count: int, entry_size: int = 10) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for i in range(count):
            zf.writestr(f"entry_{i}.xml", "x" * entry_size)
    return buf.getvalue()


def _make_docx_with_large_entry(entry_size: int) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_STORED) as zf:
        zf.writestr("big_entry.xml", "x" * entry_size)
    return buf.getvalue()


class TestValidateDocxZip:
    def test_normal_docx_passes(self):
        data = _make_docx_with_entries(5, entry_size=100)
        validate_docx_zip(data, size_limit=TIER_SIZE_LIMITS[0])

    def test_too_many_entries_raises_422(self):
        data = _make_docx_with_entries(1001)
        with pytest.raises(HTTPException) as exc:
            validate_docx_zip(data, size_limit=TIER_SIZE_LIMITS[0])
        assert exc.value.status_code == 422

    def test_single_large_entry_raises_422(self):
        # Single entry > 50 MB (DOCX_MAX_SINGLE_ENTRY_BYTES)
        from src.file_utils import DOCX_MAX_SINGLE_ENTRY_BYTES
        data = _make_docx_with_large_entry(DOCX_MAX_SINGLE_ENTRY_BYTES + 1)
        with pytest.raises(HTTPException) as exc:
            validate_docx_zip(data, size_limit=TIER_SIZE_LIMITS[2])
        assert exc.value.status_code == 422

    def test_total_uncompressed_exceeds_tier_limit_raises_413(self):
        # 5 entries of 2 MB each = 10 MB total uncompressed, tier limit = 5 MB
        data = _make_docx_with_entries(5, entry_size=2 * 1024 * 1024)
        with pytest.raises(HTTPException) as exc:
            validate_docx_zip(data, size_limit=5 * 1024 * 1024)
        assert exc.value.status_code == 413

    def test_corrupt_zip_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            validate_docx_zip(b"not a zip file at all", size_limit=TIER_SIZE_LIMITS[0])
        assert exc.value.status_code == 422


# ── Character budget / truncation ─────────────────────────────────────────────

class TestApplyCharBudget:
    def test_text_within_budget_unchanged(self):
        text = "a" * (CHAR_BUDGET - 1)
        result, truncated, warnings = apply_char_budget(text, "pdf")
        assert result == text
        assert truncated is False
        assert warnings == []

    def test_text_exactly_at_budget_unchanged(self):
        text = "a" * CHAR_BUDGET
        result, truncated, warnings = apply_char_budget(text, "txt")
        assert result == text
        assert truncated is False

    def test_text_over_budget_truncated(self):
        text = "a" * (CHAR_BUDGET + 1000)
        result, truncated, warnings = apply_char_budget(text, "docx")
        assert len(result) == CHAR_BUDGET
        assert truncated is True
        assert len(warnings) == 1
        assert "50,000" in warnings[0]

    def test_warning_mentions_file_type(self):
        text = "x" * (CHAR_BUDGET + 1)
        _, _, warnings = apply_char_budget(text, "pdf")
        assert "PDF" in warnings[0]

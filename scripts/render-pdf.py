#!/usr/bin/env python3
"""Render print-ready PDF from HTML using WeasyPrint."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Render travel album PDF via WeasyPrint")
    parser.add_argument("html_path", help="Path to input HTML file")
    parser.add_argument("pdf_path", help="Path to output PDF file")
    parser.add_argument(
        "--format",
        choices=["a4-landscape", "square"],
        default="a4-landscape",
        help="Page format hint (CSS @page in HTML is authoritative)",
    )
    args = parser.parse_args()

    try:
        from weasyprint import HTML
    except ImportError:
        print(
            "WeasyPrint no está instalado. Ejecuta: pip install weasyprint",
            file=sys.stderr,
        )
        return 1

    html_path = Path(args.html_path).resolve()
    pdf_path = Path(args.pdf_path).resolve()
    base_url = html_path.parent.as_uri() + "/"

    try:
        document = HTML(filename=str(html_path), base_url=base_url)
        try:
            document.write_pdf(str(pdf_path), optimize_images=True, jpeg_quality=85)
        except TypeError:
            document.write_pdf(str(pdf_path))
    except Exception as exc:  # noqa: BLE001
        print(f"Error al generar PDF: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

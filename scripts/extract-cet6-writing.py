"""Phase16.6 CET6 Writing text-layer audit.

This script never uses OCR and never writes full past-paper text. It reports only
file/page counts and Writing hit locations, then cross-checks the curated JSON.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
CORPUS = ROOT / "local-corpus" / "cet6"
TOPICS_JSON = ROOT / "data" / "cet6-writing-topics.json"
WRITING_RE = re.compile(
    r"Part\s*I[\s\S]{0,200}?Writ(?:ing|in\s*g)|Writing\s*\(\s*30\s*minutes\s*\)",
    re.IGNORECASE,
)


def scan_pdf(path: Path) -> dict:
    reader = PdfReader(str(path))
    writing_pages: list[int] = []
    writing_hits = 0
    text_chars = 0
    for index, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        text_chars += len(text)
        matches = WRITING_RE.findall(text)
        if matches:
            writing_pages.append(index + 1)
            writing_hits += len(matches)
    return {
        "sourceFile": path.name,
        "pageCount": len(reader.pages),
        "textChars": text_chars,
        "writingPages": writing_pages,
        "writingHitCount": writing_hits,
        "status": "extracted" if writing_pages else "needsReview",
    }


def normalize_directions(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def build_report() -> dict:
    if not CORPUS.exists():
        raise FileNotFoundError(f"Corpus directory not found: {CORPUS}")
    files = sorted(CORPUS.glob("*.pdf"))
    scans = [scan_pdf(path) for path in files]
    topics_data = json.loads(TOPICS_JSON.read_text(encoding="utf-8"))
    topics = topics_data["topics"]
    corpus_names = {path.name for path in files}

    missing_sources = sorted({topic["sourceFile"] for topic in topics} - corpus_names)
    invalid_pages = []
    scan_by_name = {item["sourceFile"]: item for item in scans}
    for topic in topics:
        scan = scan_by_name.get(topic["sourceFile"])
        if not scan or not (1 <= int(topic["sourcePage"]) <= scan["pageCount"]):
            invalid_pages.append(topic["id"])

    groups: dict[str, list[str]] = {}
    for topic in topics:
        groups.setdefault(normalize_directions(topic["directions"]), []).append(topic["id"])
    duplicate_groups = [ids for ids in groups.values() if len(ids) > 1]
    successful = [item for item in scans if item["status"] == "extracted"]
    needs_review = [item for item in scans if item["status"] == "needsReview"]

    return {
        "pdfCount": len(files),
        "successfulPdfCount": len(successful),
        "needsReviewPdfCount": len(needs_review),
        "topicRecordCount": len(topics),
        "independentTopicCount": len(topics) - sum(len(group) - 1 for group in duplicate_groups),
        "duplicateGroupCount": len(duplicate_groups),
        "writingHitCount": sum(item["writingHitCount"] for item in scans),
        "ocrPages": 0,
        "missingSources": missing_sources,
        "invalidSourcePages": invalid_pages,
        "needsReview": [item["sourceFile"] for item in needs_review],
        "duplicateGroups": duplicate_groups,
        "files": scans,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    args = parser.parse_args()
    report = build_report()
    if args.json:
        print(json.dumps(report, ensure_ascii=False))
        return
    print(f"CET6 PDFs: {report['pdfCount']}")
    print(f"Writing extracted: {report['successfulPdfCount']}")
    print(f"Needs review: {report['needsReviewPdfCount']}")
    print(f"Topic records: {report['topicRecordCount']}")
    print(f"Independent topics: {report['independentTopicCount']}")
    print(f"Duplicate groups: {report['duplicateGroupCount']}")
    for source in report["needsReview"]:
        print(f"needsReview: {source}")


if __name__ == "__main__":
    main()

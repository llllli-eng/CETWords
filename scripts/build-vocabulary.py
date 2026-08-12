#!/usr/bin/env python3
"""Build the local CET-4/CET-6 vocabulary files from KyleBing's source data.

The browser never runs this script. It is a repeatable development-time converter
that keeps third-party field names out of the application's business logic.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPOSITORY_URL = "https://github.com/KyleBing/english-vocabulary"
RAW_BASE_URL = (
    "https://raw.githubusercontent.com/KyleBing/english-vocabulary/"
    "master/json_original/json-sentence"
)
SOURCE_FILES = {
    "cet4": ["CET4_1.json", "CET4_2.json", "CET4_3.json"],
    "cet6": ["CET6_1.json", "CET6_2.json", "CET6_3.json"],
}
SUPPLEMENTAL_SOURCE_FILES = {
    # The repository's three CET4 lists contain only 4,544 unique spellings after
    # the required word-level deduplication. Its high-school list supplies the
    # prerequisite vocabulary needed for a complete 5,000+ word learning path.
    "cet4": ["GaoZhong_2.json", "GaoZhong_3.json"],
    # CET6 study assumes CET4 knowledge. Missing CET4 entries are therefore used
    # as prerequisites, while CET6 records always win when a word overlaps.
    "cet6": ["CET4_1.json", "CET4_2.json", "CET4_3.json"],
}
REQUIRED_OUTPUT_FIELDS = ("id", "word", "meaning")
SHORT_MEANING_LIMIT = 56


def clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()


def normalize_part_of_speech(value: Any) -> str:
    text = clean_text(value).strip(". ")
    return f"{text}." if text else ""


def format_phonetic(value: Any) -> str:
    text = clean_text(value).strip("/ ")
    return f"/{text}/" if text else ""


def stable_slug(word: str) -> str:
    normalized = unicodedata.normalize("NFKC", word).casefold().strip()
    normalized = normalized.replace("&", " and ")
    normalized = normalized.replace("'", "").replace("’", "")
    slug = re.sub(r"[^\w]+", "-", normalized, flags=re.UNICODE).strip("-_")
    return slug or hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]


def build_stable_id(book_id: str, word: str) -> str:
    return f"{book_id}-{stable_slug(word)}"


def shorten_translation(translation: str, available: int) -> str:
    if len(translation) <= available:
        return translation

    pieces = [piece.strip() for piece in re.split(r"[；;。]", translation) if piece.strip()]
    selected: list[str] = []
    for piece in pieces:
        candidate = "；".join([*selected, piece])
        if len(candidate) > available:
            break
        selected.append(piece)
    if selected:
        return "；".join(selected)

    first_piece = re.split(r"[，,]", translation, maxsplit=1)[0].strip()
    if first_piece and len(first_piece) <= available:
        return first_piece
    return f"{translation[: max(1, available - 1)].rstrip()}…"


def build_short_meaning(meanings: list[dict[str, str]]) -> str:
    if not meanings:
        return ""
    primary = meanings[0]
    prefix = primary["partOfSpeech"]
    available = max(8, SHORT_MEANING_LIMIT - len(prefix) - (1 if prefix else 0))
    translation = shorten_translation(primary["translation"], available)
    return f"{prefix} {translation}".strip()


def normalize_meanings(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        translation = clean_text(item.get("translation"))
        if not translation:
            continue
        meaning = {
            "partOfSpeech": normalize_part_of_speech(item.get("type")),
            "translation": translation,
        }
        key = (meaning["partOfSpeech"].casefold(), meaning["translation"].casefold())
        if key not in seen:
            seen.add(key)
            result.append(meaning)
    return result


def normalize_examples(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        sentence = clean_text(item.get("sentence"))
        if not sentence or sentence.casefold() in seen:
            continue
        seen.add(sentence.casefold())
        result.append(
            {
                "sentence": sentence,
                "translation": clean_text(item.get("translation")),
            }
        )
    return result


def normalize_entry(
    raw: Any,
    book_id: str,
    source_level: str,
    is_core: bool,
) -> tuple[dict[str, Any] | None, str | None]:
    if not isinstance(raw, dict):
        return None, "entry-not-object"

    word = clean_text(raw.get("word"))
    if not word:
        return None, "missing-word"

    meanings = normalize_meanings(raw.get("translations"))
    meaning = build_short_meaning(meanings)
    if not meaning:
        return None, "missing-meaning"

    examples = normalize_examples(raw.get("sentences"))
    phonetic_uk = format_phonetic(raw.get("uk"))
    phonetic_us = format_phonetic(raw.get("us"))
    first_example = examples[0] if examples else {"sentence": "", "translation": ""}

    return (
        {
            "id": build_stable_id(book_id, word),
            "word": word,
            "book": book_id,
            "sourceLevel": source_level,
            "isCore": is_core,
            "phonetic": phonetic_uk or phonetic_us,
            "phoneticUS": phonetic_us,
            "phoneticUK": phonetic_uk,
            "meaning": meaning,
            "shortMeaning": meaning,
            "meanings": meanings,
            "example": first_example["sentence"],
            "translation": first_example["translation"],
            "examples": examples,
        },
        None,
    )


def download_sources(source_dir: Path) -> None:
    source_dir.mkdir(parents=True, exist_ok=True)
    all_files = {
        name
        for groups in (SOURCE_FILES, SUPPLEMENTAL_SOURCE_FILES)
        for names in groups.values()
        for name in names
    }
    for file_name in sorted(all_files):
        destination = source_dir / file_name
        if destination.exists():
            continue
        print(f"Downloading {file_name} …")
        request = urllib.request.Request(
            f"{RAW_BASE_URL}/{file_name}",
            headers={"User-Agent": "CETWords vocabulary builder"},
        )
        with urllib.request.urlopen(request, timeout=90) as response:
            destination.write_bytes(response.read())


def read_source_file(path: Path) -> list[Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Cannot read source JSON: {path}: {error}") from error
    if not isinstance(data, list):
        raise RuntimeError(f"Source JSON is not an array: {path}")
    return data


def validate_output(words: list[dict[str, Any]], book_id: str) -> dict[str, Any]:
    ids: set[str] = set()
    normalized_words: set[str] = set()
    issues: list[str] = []
    for index, item in enumerate(words):
        for field in REQUIRED_OUTPUT_FIELDS:
            if not isinstance(item.get(field), str) or not item[field].strip():
                issues.append(f"item {index + 1}: missing {field}")
        if item.get("book") != book_id:
            issues.append(f"item {index + 1}: invalid book {item.get('book')}")
        if not isinstance(item.get("sourceLevel"), str) or not item["sourceLevel"].strip():
            issues.append(f"item {index + 1}: missing sourceLevel")
        if not isinstance(item.get("isCore"), bool):
            issues.append(f"item {index + 1}: invalid isCore")
        word_key = item.get("word", "").strip().casefold()
        word_id = item.get("id", "")
        if word_key in normalized_words:
            issues.append(f"item {index + 1}: duplicate word {item.get('word', '')}")
        if word_id in ids:
            issues.append(f"item {index + 1}: duplicate id {word_id}")
        normalized_words.add(word_key)
        ids.add(word_id)
    return {
        "valid": not issues,
        "issues": issues[:50],
        "checkedEntries": len(words),
        "book": book_id,
    }


def build_book(book_id: str, source_dir: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    primary_entries: list[Any] = []
    supplemental_entries: list[Any] = []
    primary_source_counts: dict[str, int] = {}
    supplemental_source_counts: dict[str, int] = {}
    for file_name in SOURCE_FILES[book_id]:
        items = read_source_file(source_dir / file_name)
        primary_source_counts[file_name] = len(items)
        primary_entries.extend(items)
    for file_name in SUPPLEMENTAL_SOURCE_FILES[book_id]:
        items = read_source_file(source_dir / file_name)
        supplemental_source_counts[file_name] = len(items)
        supplemental_entries.extend(items)

    words: list[dict[str, Any]] = []
    seen_words: set[str] = set()
    seen_ids: dict[str, str] = {}
    duplicates: list[str] = []
    invalid: list[dict[str, Any]] = []
    id_collisions: list[dict[str, str]] = []

    primary_unique_count = 0
    primary_duplicate_count = 0
    supplemental_added_count = 0
    supplemental_duplicate_count = 0

    for index, raw in enumerate([*primary_entries, *supplemental_entries]):
        is_primary = index < len(primary_entries)
        source_level = book_id if is_primary else ("high-school" if book_id == "cet4" else "cet4")
        item, error = normalize_entry(raw, book_id, source_level, is_primary)
        if error or item is None:
            invalid.append(
                {
                    "sourceGroup": "primary" if is_primary else "supplemental",
                    "sourceIndex": index + 1 if is_primary else index + 1 - len(primary_entries),
                    "reason": error or "unknown",
                }
            )
            continue

        word_key = item["word"].strip().casefold()
        if word_key in seen_words:
            duplicates.append(item["word"])
            if is_primary:
                primary_duplicate_count += 1
            else:
                supplemental_duplicate_count += 1
            continue

        if item["id"] in seen_ids and seen_ids[item["id"]] != word_key:
            original_id = item["id"]
            suffix = hashlib.sha1(word_key.encode("utf-8")).hexdigest()[:8]
            item["id"] = f"{original_id}-{suffix}"
            id_collisions.append(
                {"baseId": original_id, "word": item["word"], "resolvedId": item["id"]}
            )

        seen_words.add(word_key)
        seen_ids[item["id"]] = word_key
        words.append(item)
        if is_primary:
            primary_unique_count += 1
        else:
            supplemental_added_count += 1

    validation = validate_output(words, book_id)
    report = {
        "primarySourceFiles": SOURCE_FILES[book_id],
        "primarySourceFileCounts": primary_source_counts,
        "primaryRawEntries": len(primary_entries),
        "primaryUniqueEntries": primary_unique_count,
        "primaryDuplicateWordsRemoved": primary_duplicate_count,
        "supplementalSourceFiles": SUPPLEMENTAL_SOURCE_FILES[book_id],
        "supplementalSourceFileCounts": supplemental_source_counts,
        "supplementalRawEntries": len(supplemental_entries),
        "supplementalEntriesAdded": supplemental_added_count,
        "supplementalEntriesSkipped": supplemental_duplicate_count,
        "rawEntriesProcessed": len(primary_entries) + len(supplemental_entries),
        "finalEntries": len(words),
        "coreEntries": primary_unique_count,
        "supplementalEntries": supplemental_added_count,
        "duplicateWordsRemoved": len(duplicates),
        "invalidEntriesRemoved": len(invalid),
        "idCollisionsResolved": len(id_collisions),
        "missingPhonetic": sum(not item["phonetic"] for item in words),
        "missingExample": sum(not item["example"] for item in words),
        "missingExampleTranslation": sum(not item["translation"] for item in words),
        "longestShortMeaning": max((len(item["meaning"]) for item in words), default=0),
        "duplicateSamples": duplicates[:20],
        "invalidSamples": invalid[:20],
        "idCollisionSamples": id_collisions[:20],
        "validation": validation,
    }
    return words, report


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, separators=(",", ": ")) + "\n",
        encoding="utf-8",
    )
    # Parse the generated bytes again so malformed output can never pass silently.
    json.loads(path.read_text(encoding="utf-8"))


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=script_dir / "source-data" / "json-sentence",
        help="Directory containing CET4_1..3.json and CET6_1..3.json",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=script_dir.parent / "data",
        help="Directory for cet4.json, cet6.json and vocabulary-report.json",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download missing source files from the documented GitHub repository",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    output_dir = args.output_dir.resolve()
    if args.download:
        download_sources(source_dir)

    missing = [
        file_name
        for groups in (SOURCE_FILES, SUPPLEMENTAL_SOURCE_FILES)
        for names in groups.values()
        for file_name in names
        if not (source_dir / file_name).exists()
    ]
    if missing:
        print("Missing source files: " + ", ".join(missing), file=sys.stderr)
        print("Re-run with --download or provide --source-dir.", file=sys.stderr)
        return 2

    report: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "repository": REPOSITORY_URL,
            "branch": "master",
            "directory": "json_original/json-sentence",
        },
        "formatVersion": 1,
        "shortMeaningLimit": SHORT_MEANING_LIMIT,
        "books": {},
    }

    for book_id in ("cet4", "cet6"):
        words, book_report = build_book(book_id, source_dir)
        if not book_report["validation"]["valid"]:
            raise RuntimeError(f"{book_id.upper()} validation failed: {book_report['validation']['issues']}")
        write_json(output_dir / f"{book_id}.json", words)
        report["books"][book_id] = book_report
        print(
            f"{book_id.upper()}: primary_raw={book_report['primaryRawEntries']}, "
            f"primary_unique={book_report['primaryUniqueEntries']}, "
            f"primary_duplicates={book_report['primaryDuplicateWordsRemoved']}, "
            f"supplemental_added={book_report['supplementalEntriesAdded']}, "
            f"invalid={book_report['invalidEntriesRemoved']}, "
            f"final={book_report['finalEntries']}"
        )

    write_json(output_dir / "vocabulary-report.json", report)
    print(f"Report: {output_dir / 'vocabulary-report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

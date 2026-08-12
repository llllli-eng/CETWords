#!/usr/bin/env python3
"""Build merged, study-oriented CET-4/CET-6 vocabulary files.

Exam membership and meaning quality are intentionally separate: the target CET
files decide whether a word is core, while all documented source files may
contribute meanings, examples and phrases for the same normalized spelling.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
import urllib.request
from collections import Counter, defaultdict
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
    "cet4": ["GaoZhong_2.json", "GaoZhong_3.json"],
    "cet6": ["CET4_1.json", "CET4_2.json", "CET4_3.json"],
}
MEANING_SOURCE_FILES = [
    "GaoZhong_2.json",
    "GaoZhong_3.json",
    "CET4_1.json",
    "CET4_2.json",
    "CET4_3.json",
    "CET6_1.json",
    "CET6_2.json",
    "CET6_3.json",
]
REQUIRED_OUTPUT_FIELDS = ("id", "word", "meaning", "coreMeaning", "shortMeaning")
CORE_MEANING_LIMIT = 56
MAX_MEANINGS = 6
MAX_EXAMPLES = 8
MAX_PHRASES = 20

# A small, auditable exception layer is used only after source aggregation.
# Entries are backed by the documented source records; the explicit `paper`
# exam-sense requirement additionally comes from the Phase 12 acceptance spec.
# This layer does not replace the systematic merge.
CURATED_COMMON_MEANINGS: dict[str, dict[str, Any]] = {
    "paper": {
        "core": "纸；论文；试卷",
        "meanings": [("n.", "纸；纸张"), ("n.", "论文；文章"), ("n.", "试卷"), ("v.", "给……贴壁纸")],
    },
    "address": {
        "core": "地址；处理；向……讲话",
        "meanings": [("n.", "地址；演说"), ("v.", "处理；解决"), ("v.", "向……讲话；写姓名地址")],
    },
    "present": {
        "core": "现在的；礼物；呈现",
        "meanings": [("adj.", "现在的；出席的"), ("n.", "现在；礼物"), ("v.", "提出；呈现；赠送")],
    },
    "issue": {
        "core": "问题；发行；发布",
        "meanings": [("n.", "问题"), ("n.", "期号；发行"), ("v.", "发布；发行；分发")],
    },
    "subject": {
        "core": "主题；学科；主语",
        "meanings": [("n.", "主题；学科；主语"), ("adj.", "易受……的；受制于……的"), ("v.", "使服从；使隶属")],
    },
    "article": {
        "core": "文章；物品；条款",
        "meanings": [("n.", "文章"), ("n.", "物品；条款"), ("n.", "冠词")],
    },
    "book": {
        "core": "书；预订",
        "meanings": [("n.", "书；书籍"), ("v.", "预订；登记")],
    },
    "head": {
        "core": "头；负责人；领导",
        "meanings": [("n.", "头；头部；负责人"), ("v.", "领导；朝……前进"), ("v.", "用头顶")],
    },
    "net": {
        "core": "网；网络；净的",
        "meanings": [("n.", "网；网络"), ("adj.", "净的；纯的"), ("v.", "用网捕；用网覆盖")],
    },
    "case": {
        "core": "情况；案例；案件",
        "meanings": [("n.", "情况；案例"), ("n.", "案件；病例"), ("n.", "箱；盒")],
    },
    "charge": {
        "core": "收费；费用；控告；充电",
        "meanings": [("v.", "收费；控告；充电"), ("n.", "费用；控告；管理"), ("n.", "电荷；充电")],
    },
    "figure": {
        "core": "数字；人物；图形",
        "meanings": [("n.", "数字；人物；图形"), ("n.", "身材；轮廓"), ("v.", "计算；认为；猜想")],
    },
    "matter": {
        "core": "事情；物质；重要",
        "meanings": [("n.", "事情；问题；物质"), ("v.", "要紧；重要")],
    },
    "capital": {
        "core": "首都；资本；大写字母",
        "meanings": [("n.", "首都；资本；大写字母"), ("adj.", "重要的；大写的；资本的")],
    },
    "board": {
        "core": "板；董事会；登上",
        "meanings": [("n.", "板；牌子；董事会"), ("v.", "登上（飞机、车、船等）"), ("n.", "膳食；膳宿")],
    },
    "point": {
        "core": "点；观点；要点；分数",
        "meanings": [("n.", "点；观点；要点；分数"), ("v.", "指；指向")],
    },
    "term": {
        "core": "术语；学期；期限；条款",
        "meanings": [("n.", "术语；学期；期限；条款"), ("v.", "称为；叫作")],
    },
}

POS_PRIORITY = {"n.": 8, "adj.": 7, "v.": 6, "adv.": 5, "prep.": 4, "conj.": 3, "pron.": 3, "num.": 2, "": 1}
LEVEL_PRIORITY = {"high-school": 3, "cet4": 2, "cet6": 1}


def clean_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    text = unicodedata.normalize("NFKC", value)
    text = text.replace("...", "……").replace("…...", "……")
    return re.sub(r"\s+", " ", text).strip()


def normalized_word(value: Any) -> str:
    return clean_text(value).replace("’", "'").casefold()


def normalize_part_of_speech(value: Any) -> str:
    text = clean_text(value).casefold().strip(". ")
    aliases = {
        "noun": "n", "verb": "v", "vt": "v", "vi": "v",
        "adjective": "adj", "a": "adj", "adverb": "adv", "ad": "adv",
        "preposition": "prep", "conjunction": "conj", "pronoun": "pron",
        "numeral": "num",
    }
    text = aliases.get(text, text)
    return f"{text}." if text else ""


def normalize_sense(value: Any) -> str:
    text = clean_text(value)
    text = re.sub(r"\[(?:语|机|数|医|化|计|律|音|体|生|植|动|俚|俗|文|口)\]\s*", "", text)
    text = text.strip("；;，,。. ")
    return text


def sense_key(value: str) -> str:
    return re.sub(r"[\s；;，,。.、（）()\[\]…·\-]+", "", value).casefold()


def format_phonetic(value: Any) -> str:
    text = clean_text(value).strip("/ ")
    return f"/{text}/" if text else ""


def stable_slug(word: str) -> str:
    normalized = unicodedata.normalize("NFKC", word).casefold().strip()
    normalized = normalized.replace("&", " and ").replace("'", "").replace("’", "")
    slug = re.sub(r"[^\w]+", "-", normalized, flags=re.UNICODE).strip("-_")
    return slug or hashlib.sha1(normalized.encode("utf-8")).hexdigest()[:12]


def build_stable_id(book_id: str, word: str) -> str:
    return f"{book_id}-{stable_slug(word)}"


def source_level_for_file(file_name: str) -> str:
    if file_name.startswith("GaoZhong"):
        return "high-school"
    if file_name.startswith("CET4"):
        return "cet4"
    return "cet6"


def split_translation(value: Any) -> list[str]:
    text = normalize_sense(value)
    if not text:
        return []
    return [normalize_sense(piece) for piece in re.split(r"[；;]+", text) if normalize_sense(piece)]


def normalize_examples(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    result: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        sentence = clean_text(item.get("sentence"))
        if sentence:
            result.append({"sentence": sentence, "translation": clean_text(item.get("translation"))})
    return result


def normalize_phrases(raw: Any) -> list[dict[str, str]]:
    if not isinstance(raw, list):
        return []
    result: list[dict[str, str]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        phrase = clean_text(item.get("phrase"))
        if phrase:
            result.append({"phrase": phrase, "translation": clean_text(item.get("translation"))})
    return result


def read_source_file(path: Path) -> list[Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Cannot read source JSON: {path}: {error}") from error
    if not isinstance(data, list):
        raise RuntimeError(f"Source JSON is not an array: {path}")
    return data


def download_sources(source_dir: Path) -> None:
    source_dir.mkdir(parents=True, exist_ok=True)
    for file_name in MEANING_SOURCE_FILES:
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


def load_source_catalog(source_dir: Path) -> tuple[dict[str, list[dict[str, Any]]], dict[str, int]]:
    catalog: dict[str, list[dict[str, Any]]] = defaultdict(list)
    counts: dict[str, int] = {}
    for file_name in MEANING_SOURCE_FILES:
        rows = read_source_file(source_dir / file_name)
        counts[file_name] = len(rows)
        for index, raw in enumerate(rows):
            if not isinstance(raw, dict):
                continue
            word = clean_text(raw.get("word"))
            if not word:
                continue
            catalog[normalized_word(word)].append({
                "file": file_name,
                "level": source_level_for_file(file_name),
                "index": index,
                "word": word,
                "uk": format_phonetic(raw.get("uk")),
                "us": format_phonetic(raw.get("us")),
                "translations": raw.get("translations") if isinstance(raw.get("translations"), list) else [],
                "examples": normalize_examples(raw.get("sentences")),
                "phrases": normalize_phrases(raw.get("phrases")),
            })
    return catalog, counts


def build_membership(book_id: str, catalog: dict[str, list[dict[str, Any]]], source_dir: Path) -> tuple[list[dict[str, Any]], dict[str, int]]:
    words: list[dict[str, Any]] = []
    seen: set[str] = set()
    stats = {"primaryRaw": 0, "primaryUnique": 0, "primaryDuplicates": 0, "supplementalRaw": 0, "supplementalAdded": 0, "supplementalSkipped": 0}
    groups = [
        (SOURCE_FILES[book_id], True, book_id),
        (SUPPLEMENTAL_SOURCE_FILES[book_id], False, "high-school" if book_id == "cet4" else "cet4"),
    ]
    for file_names, is_core, source_level in groups:
        for file_name in file_names:
            for raw in read_source_file(source_dir / file_name):
                stats["primaryRaw" if is_core else "supplementalRaw"] += 1
                word = clean_text(raw.get("word")) if isinstance(raw, dict) else ""
                key = normalized_word(word)
                if not key or key not in catalog:
                    continue
                if key in seen:
                    stats["primaryDuplicates" if is_core else "supplementalSkipped"] += 1
                    continue
                seen.add(key)
                stats["primaryUnique" if is_core else "supplementalAdded"] += 1
                words.append({"word": word, "key": key, "isCore": is_core, "sourceLevel": source_level})
    return words, stats


def collect_sense_candidates(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    occurrence_counts: Counter[tuple[str, str]] = Counter()
    for record_order, record in enumerate(records):
        for translation_order, item in enumerate(record["translations"]):
            if not isinstance(item, dict):
                continue
            pos = normalize_part_of_speech(item.get("type")) or "其他"
            for sense_order, meaning in enumerate(split_translation(item.get("translation"))):
                key = (pos, sense_key(meaning))
                if key[1]:
                    occurrence_counts[key] += 1
                    candidates.append({
                        "pos": pos,
                        "meaning": meaning,
                        "key": key[1],
                        "level": record["level"],
                        "file": record["file"],
                        "recordOrder": record_order,
                        "sourceOrder": translation_order * 20 + sense_order,
                    })
    for candidate in candidates:
        candidate["occurrences"] = occurrence_counts[(candidate["pos"], candidate["key"])]
    return candidates


def dedupe_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best: dict[tuple[str, str], dict[str, Any]] = {}
    for candidate in candidates:
        key = (candidate["pos"], candidate["key"])
        current = best.get(key)
        score = (candidate["occurrences"], LEVEL_PRIORITY.get(candidate["level"], 0), -candidate["recordOrder"], -candidate["sourceOrder"])
        if current is None or score > current["score"]:
            best[key] = {**candidate, "score": score}
    return list(best.values())


def rank_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        candidates,
        key=lambda item: (
            -item["occurrences"],
            -LEVEL_PRIORITY.get(item["level"], 0),
            -POS_PRIORITY.get(item["pos"], 0),
            item["recordOrder"],
            item["sourceOrder"],
            len(item["meaning"]),
        ),
    )


def build_meanings(
    word_key: str,
    candidates: list[dict[str, Any]],
    source_record_count: int,
) -> tuple[list[dict[str, str]], str, int]:
    curated = CURATED_COMMON_MEANINGS.get(word_key)
    if curated:
        rows = [{"pos": pos, "meaning": meaning, "partOfSpeech": pos, "translation": meaning} for pos, meaning in curated["meanings"]]
        return rows, curated["core"], len(candidates)

    ranked = rank_candidates(dedupe_candidates(candidates))
    selected: list[dict[str, Any]] = []
    selected_keys: set[tuple[str, str]] = set()
    pos_counts: Counter[str] = Counter()
    selected_positions: set[str] = set()
    # A word appearing in more independent source records deserves more than a
    # single surviving sense.  Keep this deliberately conservative: two source
    # records target two common senses, three or more target three, and no POS
    # can dominate the result with more than two entries.
    target_count = 1 if source_record_count <= 1 else min(3, source_record_count)
    recurring_positions = {item["pos"] for item in ranked if item["occurrences"] >= 2}
    for candidate in ranked:
        key = (candidate["pos"], candidate["key"])
        if key in selected_keys or pos_counts[candidate["pos"]] >= 2:
            continue
        selected.append(candidate)
        selected_keys.add(key)
        pos_counts[candidate["pos"]] += 1
        selected_positions.add(candidate["pos"])
        if len(selected) >= MAX_MEANINGS or (
            len(selected) >= target_count and recurring_positions.issubset(selected_positions)
        ):
            break

    if not selected and ranked:
        selected.append(ranked[0])

    rows = [
        {"pos": item["pos"], "meaning": item["meaning"], "partOfSpeech": item["pos"], "translation": item["meaning"]}
        for item in selected
    ]
    core_parts: list[str] = []
    for item in selected:
        for piece in re.split(r"[；;]+", item["meaning"]):
            piece = normalize_sense(piece)
            if not piece or sense_key(piece) in {sense_key(value) for value in core_parts}:
                continue
            candidate_core = "；".join([*core_parts, piece])
            if len(candidate_core) > CORE_MEANING_LIMIT:
                continue
            core_parts.append(piece)
            if len(core_parts) >= 3:
                break
        if len(core_parts) >= 3:
            break
    core = "；".join(core_parts) or (rows[0]["meaning"] if rows else "")
    return rows, core, len(ranked)


def meanings_by_pos(meanings: list[dict[str, str]]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for item in meanings:
        grouped.setdefault(item["pos"] or "其他", []).append(item["meaning"])
    return grouped


def full_meaning_text(grouped: dict[str, list[str]]) -> str:
    return " ".join(f"{pos} {'；'.join(values)}".strip() for pos, values in grouped.items())


def score_record_for_example(record: dict[str, Any], core_meaning: str, primary_pos: str) -> tuple[int, int, int]:
    translations = " ".join(clean_text(item.get("translation")) for item in record["translations"] if isinstance(item, dict))
    pos_values = {normalize_part_of_speech(item.get("type")) for item in record["translations"] if isinstance(item, dict)}
    overlap = sum(1 for piece in core_meaning.split("；") if piece and piece in translations)
    return (overlap, 1 if primary_pos in pos_values else 0, LEVEL_PRIORITY.get(record["level"], 0))


def merge_examples(records: list[dict[str, Any]], core_meaning: str, primary_pos: str) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    ranked_records = sorted(records, key=lambda record: score_record_for_example(record, core_meaning, primary_pos), reverse=True)
    for record in ranked_records:
        for example in record["examples"]:
            key = clean_text(example["sentence"]).casefold()
            if key and key not in seen:
                seen.add(key)
                result.append(example)
                if len(result) >= MAX_EXAMPLES:
                    return result
    return result


def merge_phrases(records: list[dict[str, Any]]) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    for record in records:
        for phrase in record["phrases"]:
            key = clean_text(phrase["phrase"]).casefold()
            if key and key not in seen:
                seen.add(key)
                result.append(phrase)
                if len(result) >= MAX_PHRASES:
                    return result
    return result


def choose_pronunciation(records: list[dict[str, Any]]) -> tuple[str, str]:
    ranked = sorted(records, key=lambda record: LEVEL_PRIORITY.get(record["level"], 0), reverse=True)
    uk = next((record["uk"] for record in ranked if record["uk"]), "")
    us = next((record["us"] for record in ranked if record["us"]), "")
    return uk, us


def build_word(book_id: str, membership: dict[str, Any], records: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str], int]:
    candidates = collect_sense_candidates(records)
    meanings, core_meaning, source_sense_count = build_meanings(
        membership["key"], candidates, len(records)
    )
    grouped = meanings_by_pos(meanings)
    primary_pos = meanings[0]["pos"] if meanings else ""
    examples = merge_examples(records, core_meaning, primary_pos)
    phrases = merge_phrases(records)
    phonetic_uk, phonetic_us = choose_pronunciation(records)
    first_example = examples[0] if examples else {"sentence": "", "translation": ""}
    item = {
        "id": build_stable_id(book_id, membership["word"]),
        "word": membership["word"],
        "book": book_id,
        "sourceLevel": membership["sourceLevel"],
        "isCore": membership["isCore"],
        "phonetic": phonetic_uk or phonetic_us,
        "phoneticUS": phonetic_us,
        "phoneticUK": phonetic_uk,
        "coreMeaning": core_meaning,
        "shortMeaning": core_meaning,
        "meaning": full_meaning_text(grouped),
        "meanings": meanings,
        "meaningsByPos": grouped,
        "example": first_example["sentence"],
        "translation": first_example["translation"],
        "examples": examples,
        "phrases": phrases,
        "sourceRecordsCount": len(records),
        "meaningSourceFiles": sorted({record["file"] for record in records}),
    }
    warnings: list[str] = []
    source_positions = {candidate["pos"] for candidate in candidates if candidate["pos"]}
    if len(meanings) == 1 and len(records) == 1:
        warnings.append("single_sense")
    if len(source_positions) > 1:
        warnings.append("source_pos_conflict")
    if len(phrases) >= 10 and len(meanings) <= 1:
        warnings.append("phrase_rich_meaning_sparse")
    if source_sense_count >= 8 and source_sense_count > len(meanings) * 4:
        warnings.append("source_senses_compacted")
    if len(core_meaning) > CORE_MEANING_LIMIT:
        warnings.append("core_meaning_too_long")
    if re.search(r"<[^>]+>|&[a-z]+;|�", item["meaning"], re.I):
        warnings.append("suspicious_symbols")
    if len(records) == 1 and len(meanings) == 1 and primary_pos == "v." and len(phrases) >= 10:
        warnings.append("single_specific_sense")
    return item, warnings, source_sense_count


def validate_output(words: list[dict[str, Any]], book_id: str) -> dict[str, Any]:
    ids: set[str] = set()
    word_keys: set[str] = set()
    issues: list[str] = []
    for index, item in enumerate(words):
        for field in REQUIRED_OUTPUT_FIELDS:
            if not isinstance(item.get(field), str) or not item[field].strip():
                issues.append(f"item {index + 1}: missing {field}")
        if not isinstance(item.get("meanings"), list) or not item["meanings"]:
            issues.append(f"item {index + 1}: empty meanings")
        if not isinstance(item.get("meaningsByPos"), dict) or not item["meaningsByPos"]:
            issues.append(f"item {index + 1}: empty meaningsByPos")
        if item.get("book") != book_id or not isinstance(item.get("isCore"), bool):
            issues.append(f"item {index + 1}: invalid membership")
        word_key = normalized_word(item.get("word"))
        word_id = item.get("id", "")
        if word_key in word_keys:
            issues.append(f"item {index + 1}: duplicate word {item.get('word', '')}")
        if word_id in ids:
            issues.append(f"item {index + 1}: duplicate id {word_id}")
        word_keys.add(word_key)
        ids.add(word_id)
    paper = next((item for item in words if normalized_word(item["word"]) == "paper"), None)
    if not paper or "纸" not in paper["coreMeaning"] or paper["coreMeaning"] == "贴壁纸":
        issues.append("paper: missing common noun meaning")
    return {"valid": not issues, "issues": issues[:100], "checkedEntries": len(words), "book": book_id}


def build_book(book_id: str, catalog: dict[str, list[dict[str, Any]]], source_dir: Path, source_counts: dict[str, int]) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    memberships, membership_stats = build_membership(book_id, catalog, source_dir)
    words: list[dict[str, Any]] = []
    warning_records: list[dict[str, Any]] = []
    meaning_counts: list[int] = []
    cross_source_merged = 0
    for membership in memberships:
        records = catalog[membership["key"]]
        item, warnings, source_sense_count = build_word(book_id, membership, records)
        words.append(item)
        meaning_counts.append(len(item["meanings"]))
        if len(item["meaningSourceFiles"]) > 1:
            cross_source_merged += 1
        if warnings:
            warning_records.append({
                "word": item["word"],
                "book": book_id,
                "coreMeaning": item["coreMeaning"],
                "fullMeaning": item["meaning"],
                "allSourceMeanings": [
                    {"pos": candidate["pos"], "meaning": candidate["meaning"], "file": candidate["file"]}
                    for candidate in rank_candidates(dedupe_candidates(collect_sense_candidates(records)))
                ],
                "sourceRecordsCount": len(records),
                "sourceSenseCount": source_sense_count,
                "warning": warnings,
            })
    validation = validate_output(words, book_id)
    report = {
        "primarySourceFiles": SOURCE_FILES[book_id],
        "primarySourceFileCounts": {name: source_counts[name] for name in SOURCE_FILES[book_id]},
        "primaryRawEntries": membership_stats["primaryRaw"],
        "primaryUniqueEntries": membership_stats["primaryUnique"],
        "primaryDuplicateWordsMerged": membership_stats["primaryDuplicates"],
        "primaryDuplicateWordsRemoved": membership_stats["primaryDuplicates"],
        "supplementalSourceFiles": SUPPLEMENTAL_SOURCE_FILES[book_id],
        "supplementalSourceFileCounts": {name: source_counts[name] for name in SUPPLEMENTAL_SOURCE_FILES[book_id]},
        "supplementalRawEntries": membership_stats["supplementalRaw"],
        "supplementalEntriesAdded": membership_stats["supplementalAdded"],
        "supplementalEntriesMergedIntoExisting": membership_stats["supplementalSkipped"],
        "supplementalEntriesSkipped": membership_stats["supplementalSkipped"],
        "rawEntriesProcessed": membership_stats["primaryRaw"] + membership_stats["supplementalRaw"],
        "finalEntries": len(words),
        "coreEntries": sum(item["isCore"] for item in words),
        "supplementalEntries": sum(not item["isCore"] for item in words),
        "duplicateWordsRemoved": membership_stats["primaryRaw"] + membership_stats["supplementalRaw"] - len(words),
        "invalidEntriesRemoved": 0,
        "idCollisionsResolved": 0,
        "polysemousEntries": sum(count > 1 for count in meaning_counts),
        "singleSenseEntries": sum(count == 1 for count in meaning_counts),
        "averageMeaningsPerWord": round(sum(meaning_counts) / max(1, len(meaning_counts)), 3),
        "crossSourceMergedEntries": cross_source_merged,
        "qualityWarningEntries": len(warning_records),
        "qualityWarningCounts": dict(Counter(code for record in warning_records for code in record["warning"])),
        "missingPhonetic": sum(not item["phonetic"] for item in words),
        "missingExample": sum(not item["example"] for item in words),
        "missingExampleTranslation": sum(not item["translation"] for item in words),
        "longestShortMeaning": max((len(item["shortMeaning"]) for item in words), default=0),
        "validation": validation,
    }
    return words, report, warning_records


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, separators=(",", ": ")) + "\n", encoding="utf-8")
    json.loads(path.read_text(encoding="utf-8"))


def write_quality_markdown(path: Path, report: dict[str, Any]) -> None:
    lines = [
        "# 词库质量报告",
        "",
        f"> 生成时间：{report['generatedAt']}",
        "",
        "本报告由构建脚本自动生成。警告表示需要继续审计，不等同于词条一定错误。",
        "",
        "## 总览",
        "",
        "| 词库 | 总词数 | 核心 | 补充 | 多义词 | 平均义项 | 单一义项 | 跨来源合并 | 警告词条 |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for book_id in ("cet4", "cet6"):
        item = report["books"][book_id]
        lines.append(
            f"| {book_id.upper()} | {item['finalEntries']:,} | {item['coreEntries']:,} | {item['supplementalEntries']:,} | "
            f"{item['polysemousEntries']:,} | {item['averageMeaningsPerWord']:.3f} | {item['singleSenseEntries']:,} | "
            f"{item['crossSourceMergedEntries']:,} | {item['qualityWarningEntries']:,} |"
        )
    lines.extend(["", "## 高风险多义词抽查", ""])
    for item in report["regressionSamples"]:
        lines.extend([
            f"### {item['book'].upper()} · {item['word']}",
            "",
            f"- 核心义：{item['coreMeaning']}",
            f"- 完整义：{item['meaning']}",
            f"- 来源记录：{item['sourceRecordsCount']} 条",
            "",
        ])
    lines.extend([
        "## 警告含义",
        "",
        "- `single_sense`：生成后仅有一个义项。",
        "- `source_pos_conflict`：多个来源包含不同词性，已合并展示。",
        "- `phrase_rich_meaning_sparse`：短语很多但主释义仍少。",
        "- `source_senses_compacted`：源义项较多，学习词条已压缩为最多六个常见义项。",
        "- `single_specific_sense`：单一、具体的动词义且短语丰富，建议人工复核。",
        "- `suspicious_symbols`：检测到 HTML 或异常替换字符。",
        "",
        "机器可读的逐词警告见 `data/vocabulary-quality-report.json`。",
    ])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=script_dir / "source-data" / "json-sentence")
    parser.add_argument("--output-dir", type=Path, default=script_dir.parent / "data")
    parser.add_argument("--quality-doc", type=Path, default=script_dir.parent / "docs" / "VOCABULARY_QUALITY_REPORT.md")
    parser.add_argument("--download", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_dir = args.source_dir.resolve()
    output_dir = args.output_dir.resolve()
    if args.download:
        download_sources(source_dir)
    missing = [name for name in MEANING_SOURCE_FILES if not (source_dir / name).exists()]
    if missing:
        print("Missing source files: " + ", ".join(missing), file=sys.stderr)
        print("Re-run with --download or provide --source-dir.", file=sys.stderr)
        return 2

    catalog, source_counts = load_source_catalog(source_dir)
    report: dict[str, Any] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {"repository": REPOSITORY_URL, "branch": "master", "directory": "json_original/json-sentence", "files": MEANING_SOURCE_FILES},
        "formatVersion": 2,
        "coreMeaningLimit": CORE_MEANING_LIMIT,
        "maxMeanings": MAX_MEANINGS,
        "books": {},
        "regressionSamples": [],
    }
    quality_report: dict[str, Any] = {"generatedAt": report["generatedAt"], "formatVersion": 1, "books": {}}
    generated_books: dict[str, list[dict[str, Any]]] = {}
    for book_id in ("cet4", "cet6"):
        words, book_report, warnings = build_book(book_id, catalog, source_dir, source_counts)
        if not book_report["validation"]["valid"]:
            raise RuntimeError(f"{book_id.upper()} validation failed: {book_report['validation']['issues']}")
        generated_books[book_id] = words
        report["books"][book_id] = book_report
        quality_report["books"][book_id] = {"warningEntries": len(warnings), "warnings": warnings}
        write_json(output_dir / f"{book_id}.json", words)
        print(
            f"{book_id.upper()}: total={book_report['finalEntries']}, core={book_report['coreEntries']}, "
            f"supplemental={book_report['supplementalEntries']}, polysemous={book_report['polysemousEntries']}, "
            f"average_meanings={book_report['averageMeaningsPerWord']}, single={book_report['singleSenseEntries']}, "
            f"warnings={book_report['qualityWarningEntries']}, cross_source={book_report['crossSourceMergedEntries']}"
        )

    for book_id in ("cet4", "cet6"):
        lookup = {normalized_word(item["word"]): item for item in generated_books[book_id]}
        for word in ("paper", "address", "present", "issue", "subject"):
            item = lookup.get(word)
            if item:
                sample = {"book": book_id, "word": word, "coreMeaning": item["coreMeaning"], "meaning": item["meaning"], "meanings": item["meanings"], "sourceRecordsCount": item["sourceRecordsCount"]}
                report["regressionSamples"].append(sample)
                print(f"  {book_id.upper()} {word}: core={item['coreMeaning']} | meanings={len(item['meanings'])} | source_records={item['sourceRecordsCount']}")

    write_json(output_dir / "vocabulary-report.json", report)
    write_json(output_dir / "vocabulary-quality-report.json", quality_report)
    write_quality_markdown(args.quality_doc.resolve(), report)
    print(f"Report: {output_dir / 'vocabulary-report.json'}")
    print(f"Quality report: {output_dir / 'vocabulary-quality-report.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

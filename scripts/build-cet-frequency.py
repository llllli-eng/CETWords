#!/usr/bin/env python3
"""Build local-only CET exam frequency statistics without exporting exam text.

The copyrighted source PDFs remain under ignored ``local-corpus``. Committable
outputs contain only hashes, counts, identifiers, and aggregate audit data.
OCR is deliberately unsupported by this builder.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Sequence

from pypdf import PdfReader


SCHEMA_VERSION = 1
BUILDER_VERSION = "13A.2.1"
PRIMARY_YEARS = range(2021, 2026)
PRIMARY_SESSIONS = ("06", "12")
LEVELS = ("cet4", "cet6")
EXPECTED_PAPERS_PER_LEVEL = 30
PARTIAL_PAPER_IDS = {"cet4-2022-06-3", "cet6-2022-06-3"}
SAMPLE_WORDS = (
    "paper",
    "issue",
    "subject",
    "address",
    "present",
    "matter",
    "figure",
    "case",
    "charge",
    "point",
    "term",
    "article",
    "book",
    "capital",
    "board",
)
FORBIDDEN_OUTPUT_KEYS = {
    "contextExcerpt",
    "sourceSentence",
    "examSentence",
    "passage",
    "rawText",
    "cleanedText",
    "sectionText",
}
STAT_BUCKETS = (
    "readingTokenCount",
    "printedListeningTokenCount",
    "questionTokenCount",
    "writingPromptTokenCount",
    "otherPrintedTokenCount",
)
ANSWER_POLLUTION_RE = re.compile(
    r"(?im)^\s*(?:Answers?\s+and\s+Explanations|Answer\s+Key|"
    r"参考答案|答案解析|参考译文|词汇讲解|培训机构点评)\s*[:：]?"
)
TOKEN_RE = re.compile(
    r"(?<![A-Za-z\u3400-\u9fff])"
    r"[A-Za-z]+(?:['-][A-Za-z]+)*"
    r"(?![A-Za-z\u3400-\u9fff])"
)
MIXED_CJK_TOKEN_RE = re.compile(
    r"(?:[A-Za-z]+[\u3400-\u9fff]+[A-Za-z]*|"
    r"[\u3400-\u9fff]+[A-Za-z]+)"
)
QUESTION_PREFIX_RE = re.compile(r"^\s*(\d{1,2})\s*[.)]\s*(.*)$")


@dataclass
class BoilerplateRule:
    rule_id: str
    mode: str
    scopes: set[str]
    pattern: re.Pattern[str]

    def applies_to(self, section_type: str) -> bool:
        return "*" in self.scopes or section_type in self.scopes


@dataclass
class Section:
    paper_id: str
    level: str
    session_id: str
    set_number: int
    section_type: str
    raw_text: str = field(repr=False)
    cleaned_text: str = field(default="", repr=False)
    section_hash: str = ""
    raw_token_count: int = 0
    cleaned_token_count: int = 0
    boilerplate_removed_token_count: int = 0
    removed_by_rule: Counter[str] = field(default_factory=Counter)
    fragments: list[tuple[str, str]] = field(default_factory=list, repr=False)
    appeared_in_papers: set[str] = field(default_factory=set)
    shared_across_sets: bool = False

    def audit_record(self) -> dict[str, Any]:
        return {
            "sectionType": self.section_type,
            "sectionHash": self.section_hash,
            "rawTokenCount": self.raw_token_count,
            "cleanedTokenCount": self.cleaned_token_count,
            "boilerplateRemovedTokenCount": self.boilerplate_removed_token_count,
            "removedByRule": dict(sorted(self.removed_by_rule.items())),
            "appearedInPapers": sorted(self.appeared_in_papers),
            "sharedAcrossSets": self.shared_across_sets,
        }


@dataclass
class Paper:
    paper_id: str
    level: str
    year: int
    month: str
    set_number: int
    file: str
    partial: bool
    shares_common_with: int | None
    sections: list[Section] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    extraction_diagnostics: dict[str, int] = field(default_factory=dict)
    answer_pollution_detected: bool = False
    exclude_from_corpus: bool = False

    @property
    def session_id(self) -> str:
        return f"{self.year}-{self.month}"

    def audit_record(self) -> dict[str, Any]:
        return {
            "paperId": self.paper_id,
            "level": self.level,
            "session": self.session_id,
            "set": self.set_number,
            "file": self.file,
            "status": "partial" if self.partial else "complete",
            "sharesCommonSectionsWithSet": self.shares_common_with,
            "answerPollutionDetected": self.answer_pollution_detected,
            "excludeFromCorpus": self.exclude_from_corpus,
            "warnings": sorted(set(self.warnings)),
            "extractionDiagnostics": self.extraction_diagnostics,
            "sections": [section.audit_record() for section in self.sections],
        }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Project directory (defaults to the script's parent project).",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Build in memory and verify existing generated files without writing.",
    )
    parser.add_argument(
        "--quiet", action="store_true", help="Suppress the human-readable summary."
    )
    return parser.parse_args(argv)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def stable_json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def normalize_extracted_text(text: str) -> tuple[str, dict[str, int]]:
    replacement_count = text.count("\ufffd")
    private_use_count = sum(unicodedata.category(ch) == "Co" for ch in text)
    control_count = sum(
        unicodedata.category(ch) == "Cc" and ch not in "\n\r\t" for ch in text
    )
    normalized = unicodedata.normalize("NFKC", text)
    normalized = normalized.replace("\u2018", "'").replace("\u2019", "'")
    normalized = normalized.replace("\u201c", '"').replace("\u201d", '"')
    normalized = normalized.replace("\u2013", "-").replace("\u2014", "-")
    normalized = normalized.replace("\u00ad", "")
    mixed_cjk_latin_count = len(MIXED_CJK_TOKEN_RE.findall(normalized))
    normalized = MIXED_CJK_TOKEN_RE.sub(" ", normalized)
    normalized = "".join(
        ch
        for ch in normalized
        if ch != "\ufffd"
        and unicodedata.category(ch) != "Co"
        and not (unicodedata.category(ch) == "Cc" and ch not in "\n\r\t")
    )
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    return normalized, {
        "replacementCharacterCount": replacement_count,
        "privateUseCharacterCount": private_use_count,
        "abnormalControlCharacterCount": control_count,
        "mixedCjkLatinFragmentCount": mixed_cjk_latin_count,
    }


def tokenize(text: str) -> list[str]:
    return [match.group(0).lower() for match in TOKEN_RE.finditer(text)]


def normalized_hash_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).lower()
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def section_hash(text: str) -> str:
    return sha256_bytes(normalized_hash_text(text).encode("utf-8"))


def load_boilerplate_rules(path: Path) -> tuple[dict[str, Any], list[BoilerplateRule]]:
    config = json.loads(path.read_text(encoding="utf-8"))
    rules = []
    for item in config["patterns"]:
        rules.append(
            BoilerplateRule(
                rule_id=item["id"],
                mode=item["mode"],
                scopes=set(item["scopes"]),
                pattern=re.compile(item["regex"], re.IGNORECASE),
            )
        )
    return config, rules


def clean_section(section: Section, rules: Sequence[BoilerplateRule]) -> None:
    section.raw_token_count = len(tokenize(section.raw_text))
    kept_lines: list[str] = []
    for raw_line in section.raw_text.splitlines():
        line = re.sub(r"[ \t]+", " ", raw_line).strip()
        if not line:
            continue
        removed = False
        for rule in rules:
            if (
                rule.mode == "line"
                and rule.applies_to(section.section_type)
                and rule.pattern.search(line)
            ):
                count = len(tokenize(line))
                if count:
                    section.removed_by_rule[rule.rule_id] += count
                removed = True
                break
        if not removed:
            kept_lines.append(line)

    cleaned = "\n".join(kept_lines)
    for rule in rules:
        if rule.mode != "regex" or not rule.applies_to(section.section_type):
            continue

        def replace(match: re.Match[str]) -> str:
            section.removed_by_rule[rule.rule_id] += len(tokenize(match.group(0)))
            return " "

        cleaned = rule.pattern.sub(replace, cleaned)

    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{2,}", "\n", cleaned).strip()
    section.cleaned_text = cleaned
    intermediate_token_count = len(tokenize(cleaned))
    section.fragments = classify_fragments(section.section_type, cleaned)
    section.cleaned_token_count = sum(
        len(tokenize(fragment_text))
        for _, fragment_text in section.fragments
    )
    structural_label_count = intermediate_token_count - section.cleaned_token_count
    if structural_label_count:
        section.removed_by_rule[
            "structural-choice-and-paragraph-labels"
        ] += structural_label_count
    section.boilerplate_removed_token_count = max(
        0, section.raw_token_count - section.cleaned_token_count
    )
    canonical_section = "\n".join(
        f"{fragment_type}\n{fragment_text}"
        for fragment_type, fragment_text in section.fragments
    )
    section.section_hash = section_hash(canonical_section)
    section.appeared_in_papers.add(section.paper_id)


def find_span_start(text: str, patterns: Sequence[str], start: int = 0) -> int | None:
    hits: list[int] = []
    for pattern in patterns:
        match = re.search(pattern, text[start:], re.IGNORECASE | re.MULTILINE)
        if match:
            hits.append(start + match.start())
    return min(hits) if hits else None


def line_start(text: str, offset: int) -> int:
    previous_newline = text.rfind("\n", 0, offset)
    return previous_newline + 1


def locate_major_sections(text: str) -> dict[str, tuple[int, int]]:
    writing_hit = find_span_start(text, (r"\bWriting\s*\(\s*30\s+minutes",))
    listening_hit = find_span_start(
        text, (r"L\s*istening\s+Comprehension",)
    )
    reading_hit = find_span_start(
        text, (r"Reading\s*(?:Compr\s*ehension|Comprehension)",)
    )
    if reading_hit is None:
        reading_hit = find_span_start(
            text,
            (
                r"Directions?\s*:?\s*I\s*n\s+this\s+.{0,12}section,?\s+there\s+is\s+a\s+pas[^\n]{0,12}ge\s+with\s+ten\s+blanks",
            ),
            start=(listening_hit or 0),
        )
    translation_hits = list(
        re.finditer(
            r"\bTranslation\s*[.:]?\s*\(\s*30\s+minut\s*es",
            text,
            re.IGNORECASE,
        )
    )
    translation_hit = translation_hits[-1].start() if translation_hits else None

    if writing_hit is None:
        writing_hit = 0
    if listening_hit is None or reading_hit is None or translation_hit is None:
        raise ValueError(
            "Unable to locate required major section boundaries: "
            f"writing={writing_hit}, listening={listening_hit}, "
            f"reading={reading_hit}, translation={translation_hit}"
        )
    if not (writing_hit < listening_hit < reading_hit < translation_hit):
        raise ValueError(
            "Major section boundaries are out of order: "
            f"{writing_hit}, {listening_hit}, {reading_hit}, {translation_hit}"
        )
    starts = {
        "writing_prompt": line_start(text, writing_hit),
        "listening_printed": line_start(text, listening_hit),
        "reading": line_start(text, reading_hit),
        "translation_prompt": line_start(text, translation_hit),
    }
    return {
        "writing_prompt": (starts["writing_prompt"], starts["listening_printed"]),
        "listening_printed": (starts["listening_printed"], starts["reading"]),
        "reading": (starts["reading"], starts["translation_prompt"]),
        "translation_prompt": (starts["translation_prompt"], len(text)),
    }


def locate_reading_subsections(reading_text: str) -> list[tuple[str, str]]:
    heading_hits = [
        (match.group(1).upper(), line_start(reading_text, match.start()))
        for match in re.finditer(
            r"(?im)^\s*Section\s+([ABC])\s*[^A-Za-z\n]*$", reading_text
        )
    ]
    heading_hits = sorted(set(heading_hits), key=lambda item: item[1])
    ordered_heading_positions: list[int] = []
    search_from = 0
    for expected in "ABC":
        match = next(
            (
                (letter, position)
                for letter, position in heading_hits
                if letter == expected and position >= search_from
            ),
            None,
        )
        if match is None:
            break
        ordered_heading_positions.append(match[1])
        search_from = match[1] + 1
    if len(ordered_heading_positions) == 3:
        anchors = list(
            zip(
                ("reading_cloze", "reading_matching", "reading_careful"),
                ordered_heading_positions,
            )
        )
    elif [letter for letter, _ in heading_hits[:2]] == ["B", "C"]:
        # Some PDFs place the Reading heading between "Section A" and its
        # directions, so the major-section slice legitimately begins after A.
        anchors = [
            ("reading_cloze", 0),
            ("reading_matching", heading_hits[0][1]),
            ("reading_careful", heading_hits[1][1]),
        ]
    else:
        anchors = []
        patterns = (
            (
                "reading_cloze",
                r"Directions?\s*:?[^\n]{0,20}there\s+is\s+a\s+pas[^\n]{0,20}ge\s+with\s+ten\s+blanks",
            ),
            (
                "reading_matching",
                r"Directions?\s*:?[^\n]{0,20}you\s+are\s+going\s+to\s+read\s+a\s+passa[^\n]{0,20}ge\s+with\s+t[^\n]{0,10}n\s+statements",
            ),
            (
                "reading_careful",
                r"Directions?\s*:?[^\n]{0,20}There\s+are\s+2\s+passages\s+in\s+this\s+section",
            ),
        )
        for name, pattern in patterns:
            match = re.search(pattern, reading_text, re.IGNORECASE | re.MULTILINE)
            if match:
                anchors.append((name, line_start(reading_text, match.start())))
        if [name for name, _ in anchors] != [
            "reading_cloze",
            "reading_matching",
            "reading_careful",
        ]:
            raise ValueError(
                "Unable to locate all reading subsections: "
                + ", ".join(name for name, _ in anchors)
            )
    result: list[tuple[str, str]] = []
    for index, (name, start) in enumerate(anchors):
        end = anchors[index + 1][1] if index + 1 < len(anchors) else len(reading_text)
        result.append((name, reading_text[start:end]))
    return result


def split_paper_sections(paper: Paper, text: str) -> list[Section]:
    if paper.partial:
        writing_hit = find_span_start(text, (r"\bWriting\s*\(\s*30\s+minutes",))
        translation_hits = list(
            re.finditer(
                r"\bTranslation\s*[.:]?\s*\(\s*30\s+minut\s*es",
                text,
                re.IGNORECASE,
            )
        )
        if writing_hit is None or not translation_hits:
            raise ValueError("Partial paper is missing Writing or Translation")
        translation_hit = line_start(text, translation_hits[-1].start())
        pairs = [
            ("writing_prompt", text[line_start(text, writing_hit) : translation_hit]),
            ("translation_prompt", text[translation_hit:]),
        ]
    else:
        spans = locate_major_sections(text)
        pairs = [
            ("writing_prompt", text[slice(*spans["writing_prompt"])]),
            ("listening_printed", text[slice(*spans["listening_printed"])]),
        ]
        reading_text = text[slice(*spans["reading"])]
        pairs.extend(locate_reading_subsections(reading_text))
        pairs.append(
            ("translation_prompt", text[slice(*spans["translation_prompt"])])
        )
    return [
        Section(
            paper_id=paper.paper_id,
            level=paper.level,
            session_id=paper.session_id,
            set_number=paper.set_number,
            section_type=section_type,
            raw_text=section_text,
        )
        for section_type, section_text in pairs
    ]


def trim_translation_to_printed_prompt(text: str) -> tuple[str, bool]:
    """Keep the translation heading/instructions and parenthetical source terms.

    The prompt body is Chinese. Latin text that appears afterwards is usually
    page-order leakage from the preceding reading section, not translation
    content. Parenthetical English names embedded in the Chinese prompt are
    the only reliable printed English tokens beyond the fixed directions.
    """
    lines = text.splitlines()
    kept: list[str] = []
    in_chinese_prompt = False
    discarded_latin_tokens = False
    for line in lines:
        has_cjk = re.search(r"[\u3400-\u9fff]", line) is not None
        has_mojibake_prompt = (
            not in_chinese_prompt
            and unicodedata.category("".join(line[:1]) or " ") != "Ll"
            and len(tokenize(line)) >= 6
            and re.search(r"[~\\^\xb7\xa3\xbd]", line) is not None
        )
        if has_cjk or has_mojibake_prompt:
            in_chinese_prompt = True
            parenthetical_terms = re.findall(
                r"[（(]\s*([A-Za-z][A-Za-z .'-]{0,80})\s*[）)]", line
            )
            kept.extend(parenthetical_terms)
            continue
        if in_chinese_prompt:
            if tokenize(line):
                discarded_latin_tokens = True
            continue
        kept.append(line)
    return "\n".join(kept), discarded_latin_tokens


def split_choice_fragments(line: str, section_type: str) -> tuple[str, list[str]]:
    choice_letters = "A-O" if section_type == "reading_cloze" else "A-D"
    marker_pattern = re.compile(
        rf"(?<![A-Za-z])([{choice_letters}])\s*[.)]\s*"
    )
    markers = list(marker_pattern.finditer(line))
    if not markers:
        return line, []
    prefix = line[: markers[0].start()].strip()
    choices = []
    for index, marker in enumerate(markers):
        start = marker.end()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(line)
        choice = line[start:end].strip()
        if choice:
            choices.append(choice)
    return prefix, choices


def classify_fragments(section_type: str, text: str) -> list[tuple[str, str]]:
    if section_type in {"writing_prompt", "translation_prompt", "unknown"}:
        return [(section_type, text)] if text else []
    fragments: list[tuple[str, str]] = []
    passage_lines: list[str] = []

    def flush_passage() -> None:
        if passage_lines:
            fragments.append((section_type, "\n".join(passage_lines)))
            passage_lines.clear()

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        matching_paragraph = (
            re.match(r"^[A-Z]\s*[.)]\s*(.*)$", stripped)
            if section_type == "reading_matching"
            else None
        )
        if matching_paragraph:
            passage_lines.append(matching_paragraph.group(1))
            continue
        prefix, choices = split_choice_fragments(stripped, section_type)
        question_match = QUESTION_PREFIX_RE.match(prefix)
        if question_match:
            flush_passage()
            question_text = question_match.group(2).strip()
            if question_text:
                fragments.append(("question_stems", question_text))
        elif prefix and choices:
            if section_type == "listening_printed":
                flush_passage()
                fragments.append(("question_stems", prefix))
            else:
                passage_lines.append(prefix)
        elif prefix:
            passage_lines.append(prefix)
        if choices:
            flush_passage()
            fragments.append(("options", "\n".join(choices)))
    flush_passage()
    return fragments


def manifest_primary_candidates(manifest: dict[str, Any], level: str) -> list[dict[str, Any]]:
    return sorted(
        (
            paper
            for paper in manifest["papers"]
            if paper["level"] == level
            and paper.get("year") in PRIMARY_YEARS
            and paper.get("session") in PRIMARY_SESSIONS
            and paper.get("set") in {1, 2, 3}
        ),
        key=lambda item: (item["year"], item["session"], item["set"]),
    )


def extract_paper(
    root: Path,
    candidate: dict[str, Any],
    rules: Sequence[BoilerplateRule],
) -> Paper:
    paper = Paper(
        paper_id=candidate["paperId"],
        level=candidate["level"],
        year=candidate["year"],
        month=candidate["session"],
        set_number=candidate["set"],
        file=candidate["file"],
        partial=candidate["paperId"] in PARTIAL_PAPER_IDS,
        shares_common_with=candidate.get("sharesCommonSectionsWithSet"),
    )
    if not candidate.get("textExtractable"):
        raise RuntimeError(f"Primary PDF is not text extractable: {paper.paper_id}")
    path = root / "local-corpus" / candidate["file"]
    reader = PdfReader(path, strict=False)
    extracted = "\n\n".join(page.extract_text() or "" for page in reader.pages)
    text, diagnostics = normalize_extracted_text(extracted)
    diagnostics["pageCount"] = len(reader.pages)
    diagnostics["extractedCharacterCount"] = len(extracted)
    paper.extraction_diagnostics = diagnostics
    if any(diagnostics[key] for key in (
        "replacementCharacterCount",
        "privateUseCharacterCount",
        "abnormalControlCharacterCount",
    )):
        paper.warnings.append("abnormal_extracted_characters")
    if diagnostics["mixedCjkLatinFragmentCount"]:
        paper.warnings.append("mixed_cjk_latin_fragments_discarded")

    pollution = ANSWER_POLLUTION_RE.search(text)
    if pollution:
        paper.answer_pollution_detected = True
        text = text[: pollution.start()]
        paper.warnings.append("answer_explanation_tail_removed")

    try:
        paper.sections = split_paper_sections(paper, text)
    except ValueError as error:
        paper.exclude_from_corpus = True
        paper.warnings.append(f"section_split_failed:{error}")
        return paper
    for section in paper.sections:
        if section.section_type == "translation_prompt":
            section.raw_text, discarded = trim_translation_to_printed_prompt(
                section.raw_text
            )
            if discarded:
                paper.warnings.append("translation_page_order_leakage_removed")
        clean_section(section, rules)
    return paper


def statistical_bucket(base_type: str, fragment_type: str) -> str:
    if base_type == "listening_printed":
        return "printedListeningTokenCount"
    if fragment_type in {"question_stems", "options"}:
        return "questionTokenCount"
    if base_type in {"reading_cloze", "reading_matching", "reading_careful"}:
        return "readingTokenCount"
    if base_type == "writing_prompt":
        return "writingPromptTokenCount"
    return "otherPrintedTokenCount"


def inflection_candidates(surface: str, headwords: set[str]) -> set[str]:
    candidates: set[str] = set()

    def add(value: str) -> None:
        if len(value) >= 2 and value in headwords:
            candidates.add(value)

    if surface.endswith("'s"):
        add(surface[:-2])
    if surface.endswith("ies") and len(surface) > 4:
        add(surface[:-3] + "y")
    if surface.endswith("ves") and len(surface) > 4:
        add(surface[:-3] + "f")
        add(surface[:-3] + "fe")
    if surface.endswith("es") and len(surface) > 3:
        add(surface[:-2])
        add(surface[:-1])
    if surface.endswith("s") and not surface.endswith("ss") and len(surface) > 3:
        add(surface[:-1])
    if surface.endswith("ied") and len(surface) > 4:
        add(surface[:-3] + "y")
    if surface.endswith("ed") and len(surface) > 3:
        stem = surface[:-2]
        add(stem)
        add(stem + "e")
        add(surface[:-1])
        if len(stem) > 2 and stem[-1] == stem[-2]:
            add(stem[:-1])
    if surface.endswith("ing") and len(surface) > 5:
        stem = surface[:-3]
        add(stem)
        add(stem + "e")
        if len(stem) > 2 and stem[-1] == stem[-2]:
            add(stem[:-1])
    return candidates


def resolve_headword(surface: str, headwords: set[str]) -> tuple[str | None, str, list[str]]:
    if surface in headwords:
        return surface, "exact", []
    candidates = sorted(inflection_candidates(surface, headwords))
    if len(candidates) == 1:
        return candidates[0], "inflection", []
    if len(candidates) > 1:
        return None, "ambiguous", candidates
    return None, "unmatched", []


def deduplicate_sections(papers: Sequence[Paper]) -> tuple[list[Section], list[dict[str, Any]]]:
    by_key: dict[tuple[str, str, str], Section] = {}
    duplicates: list[dict[str, Any]] = []
    for paper in papers:
        if paper.exclude_from_corpus:
            continue
        for section in paper.sections:
            key = (section.level, section.session_id, section.section_hash)
            existing = by_key.get(key)
            if existing is None or not section.cleaned_text:
                if not section.cleaned_text:
                    key = (section.level, section.session_id, f"{section.section_hash}:{section.paper_id}:{section.section_type}")
                by_key[key] = section
                continue
            existing.appeared_in_papers.update(section.appeared_in_papers)
            existing.shared_across_sets = True
            section.appeared_in_papers = existing.appeared_in_papers
            section.shared_across_sets = True
            duplicates.append(
                {
                    "level": section.level,
                    "session": section.session_id,
                    "sectionHash": section.section_hash,
                    "sectionType": section.section_type,
                    "tokenCount": section.cleaned_token_count,
                    "appearedInPapers": sorted(existing.appeared_in_papers),
                }
            )

    # The one-page 2022-06 set 3 files explicitly reuse set 2 common sections.
    # Propagate the appearances for coverage while leaving token counts deduplicated.
    paper_map = {paper.paper_id: paper for paper in papers}
    for level in LEVELS:
        source = paper_map.get(f"{level}-2022-06-2")
        target = paper_map.get(f"{level}-2022-06-3")
        if source is None or target is None:
            continue
        for section in source.sections:
            if section.section_type not in {
                "listening_printed",
                "reading_cloze",
                "reading_matching",
                "reading_careful",
            }:
                continue
            if not section.cleaned_text:
                continue
            key = (section.level, section.session_id, section.section_hash)
            canonical = by_key[key]
            canonical.appeared_in_papers.add(target.paper_id)
            canonical.shared_across_sets = True
            section.appeared_in_papers = canonical.appeared_in_papers
        target.warnings.append("common_sections_reused_from_set_2_for_coverage_only")
    return list(by_key.values()), duplicates


def token_sequence_similarity(left: str, right: str) -> float:
    left_tokens = tokenize(left)
    right_tokens = tokenize(right)
    if not left_tokens and not right_tokens:
        return 1.0
    if not left_tokens or not right_tokens:
        return 0.0
    left_counts = Counter(left_tokens)
    right_counts = Counter(right_tokens)
    overlap = sum((left_counts & right_counts).values())
    return round((2 * overlap) / (len(left_tokens) + len(right_tokens)), 4)


def audit_near_duplicate_sections(papers: Sequence[Paper]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str, str], list[Section]] = defaultdict(list)
    for paper in papers:
        if paper.exclude_from_corpus:
            continue
        for section in paper.sections:
            if section.cleaned_token_count:
                groups[(paper.level, paper.session_id, section.section_type)].append(section)
    results = []
    for (level, session_id, section_type), sections in sorted(groups.items()):
        for index, left in enumerate(sections):
            for right in sections[index + 1 :]:
                if left.section_hash == right.section_hash:
                    continue
                similarity = token_sequence_similarity(left.cleaned_text, right.cleaned_text)
                if similarity < 0.90:
                    continue
                results.append(
                    {
                        "level": level,
                        "session": session_id,
                        "sectionType": section_type,
                        "paperIds": sorted([left.paper_id, right.paper_id]),
                        "similarity": similarity,
                        "tokenCounts": [left.cleaned_token_count, right.cleaned_token_count],
                        "status": "audit_only_not_deduplicated",
                    }
                )
    return results


def quantile(values: Sequence[int], probability: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(probability * len(ordered)) - 1))
    return ordered[index]


def cluster_scores(scores: Sequence[float], cluster_count: int = 5) -> tuple[list[float], list[float]]:
    unique = sorted(set(scores))
    k = min(cluster_count, len(unique))
    if not unique:
        return [], []
    if k == 1:
        return [unique[0]], []
    centers = [unique[round(i * (len(unique) - 1) / (k - 1))] for i in range(k)]
    for _ in range(100):
        groups: list[list[float]] = [[] for _ in centers]
        for value in scores:
            index = min(range(len(centers)), key=lambda i: (abs(value - centers[i]), i))
            groups[index].append(value)
        updated = [
            sum(group) / len(group) if group else centers[index]
            for index, group in enumerate(groups)
        ]
        if all(abs(a - b) < 1e-12 for a, b in zip(centers, updated)):
            break
        centers = updated
    centers = sorted(centers)
    boundaries = [
        round((centers[index] + centers[index + 1]) / 2, 4)
        for index in range(len(centers) - 1)
    ]
    return [round(value, 4) for value in centers], boundaries


def assign_tiers(words: list[dict[str, Any]]) -> dict[str, Any]:
    tolerance = 0.05
    nonzero_scores: list[float] = []
    for item in words:
        if item["tokenCount"] == 0:
            item["tierScore"] = 0.0
            continue
        log_component = min(1.0, math.log1p(item["tokenCount"]) / math.log(101))
        score = (
            0.80 * item["sessionCoverageRate"]
            + 0.18 * item["paperCoverageRate"]
            + 0.02 * log_component
        )
        score = round(round(score / tolerance) * tolerance, 2)
        item["tierScore"] = score
        nonzero_scores.append(score)
    centers, boundaries = cluster_scores(nonzero_scores, 5)
    tier_names = ["D", "C", "B", "A", "S"][-len(centers) :]
    for item in words:
        if item["tokenCount"] == 0:
            item["frequencyTier"] = "E"
            continue
        cluster_index = sum(item["tierScore"] > boundary for boundary in boundaries)
        item["frequencyTier"] = tier_names[cluster_index]
    return {
        "method": "distribution-driven 1D k-means over tolerance-quantized coverage score",
        "scoreWeights": {
            "sessionCoverageRate": 0.8,
            "paperCoverageRate": 0.18,
            "logTokenCount": 0.02,
        },
        "tierBoundaryTolerance": tolerance,
        "clusterCenters": centers,
        "boundaries": boundaries,
        "zeroTokenTier": "E",
        "note": "Tiers are broad audit bands, not a ranking or learning order.",
    }


def analyze_level(
    level: str,
    papers: Sequence[Paper],
    unique_sections: Sequence[Section],
    vocabulary_path: Path,
    duplicates: Sequence[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    vocabulary = json.loads(vocabulary_path.read_text(encoding="utf-8"))
    headwords = {entry["word"].lower() for entry in vocabulary}
    word_state: dict[str, dict[str, Any]] = {
        word: {
            "tokens": 0,
            "papers": set(),
            "sessions": set(),
            "buckets": Counter(),
            "surfaces": Counter(),
        }
        for word in headwords
    }
    unmatched = Counter()
    ambiguous: dict[str, dict[str, Any]] = {}
    exact_count = 0
    inflection_count = 0
    matched_count = 0
    total_count = 0
    section_type_counts = Counter()
    statistical_bucket_counts = Counter()

    for section in unique_sections:
        if section.level != level:
            continue
        for fragment_type, fragment_text in section.fragments:
            surfaces = tokenize(fragment_text)
            section_type_counts[fragment_type] += len(surfaces)
            bucket = statistical_bucket(section.section_type, fragment_type)
            statistical_bucket_counts[bucket] += len(surfaces)
            for surface in surfaces:
                total_count += 1
                headword, resolution, candidates = resolve_headword(surface, headwords)
                if headword is None:
                    unmatched[surface] += 1
                    if resolution == "ambiguous":
                        record = ambiguous.setdefault(
                            surface, {"surface": surface, "tokenCount": 0, "candidates": candidates}
                        )
                        record["tokenCount"] += 1
                    continue
                matched_count += 1
                if resolution == "exact":
                    exact_count += 1
                else:
                    inflection_count += 1
                state = word_state[headword]
                state["tokens"] += 1
                state["papers"].update(section.appeared_in_papers)
                state["sessions"].add(section.session_id)
                state["buckets"][bucket] += 1
                state["surfaces"][surface] += 1

    level_papers = [paper for paper in papers if paper.level == level and not paper.exclude_from_corpus]
    sessions = sorted({paper.session_id for paper in level_papers})
    paper_count = len(level_papers)
    session_count = len(sessions)
    token_values = [state["tokens"] for state in word_state.values() if state["tokens"]]
    concentration_threshold = quantile(token_values, 0.95)
    words: list[dict[str, Any]] = []
    for word in sorted(headwords):
        state = word_state[word]
        entry = {
            "word": word,
            "tokenCount": state["tokens"],
            "paperCount": len(state["papers"]),
            "sessionCount": len(state["sessions"]),
            "paperCoverageRate": round(len(state["papers"]) / paper_count, 4),
            "sessionCoverageRate": round(len(state["sessions"]) / session_count, 4),
            **{bucket: state["buckets"][bucket] for bucket in STAT_BUCKETS},
            "surfaceFormCounts": dict(sorted(state["surfaces"].items())),
            "concentratedFrequency": bool(
                state["tokens"] >= concentration_threshold
                and len(state["sessions"]) <= 2
                and state["tokens"] > 0
            ),
        }
        words.append(entry)
    tier_methodology = assign_tiers(words)
    tier_distribution = dict(
        sorted(Counter(item["frequencyTier"] for item in words).items())
    )
    session_coverage_distribution = dict(
        sorted(Counter(item["sessionCount"] for item in words).items())
    )
    paper_coverage_distribution = dict(
        sorted(Counter(item["paperCount"] for item in words).items())
    )

    dedup_sections = [section for section in unique_sections if section.level == level]
    all_sections = [section for paper in level_papers for section in paper.sections]
    raw_tokens = sum(section.raw_token_count for section in all_sections)
    cleaned_tokens = sum(section.cleaned_token_count for section in all_sections)
    dedup_tokens = sum(section.cleaned_token_count for section in dedup_sections)
    removed_by_rule = Counter()
    for section in all_sections:
        removed_by_rule.update(section.removed_by_rule)

    sample_results = {
        word: next((item for item in words if item["word"] == word), None)
        for word in SAMPLE_WORDS
    }
    top_fields = (
        "word",
        "tokenCount",
        "paperCount",
        "sessionCount",
        "paperCoverageRate",
        "sessionCoverageRate",
        "frequencyTier",
    )

    def top_list(field_name: str) -> list[dict[str, Any]]:
        ordered = sorted(
            words,
            key=lambda item: (
                -item[field_name],
                -item["sessionCoverageRate"],
                -item["paperCoverageRate"],
                -item["tokenCount"],
                item["word"],
            ),
        )[:100]
        return [{key: item[key] for key in top_fields} for item in ordered]

    output = {
        "schemaVersion": SCHEMA_VERSION,
        "builderVersion": BUILDER_VERSION,
        "level": level,
        "corpus": {
            "description": "2021-2025 CET PDF printed English and reading corpus; no listening transcript and no OCR",
            "primaryStats": {"from": "2021-06", "to": "2025-12"},
            "auxiliaryYearsExcluded": [2018, 2019, 2020],
            "sessionCount": session_count,
            "paperCount": paper_count,
            "completePaperCount": sum(not paper.partial for paper in level_papers),
            "partialPaperCount": sum(paper.partial for paper in level_papers),
        },
        "tierMethodology": tier_methodology,
        "words": words,
    }
    report = {
        "level": level,
        "sessions": sessions,
        "sessionCount": session_count,
        "paperCount": paper_count,
        "completePaperCount": sum(not paper.partial for paper in level_papers),
        "partialPaperCount": sum(paper.partial for paper in level_papers),
        "rawTokenCount": raw_tokens,
        "cleanedTokenCount": cleaned_tokens,
        "boilerplateRemovedTokenCount": raw_tokens - cleaned_tokens,
        "boilerplateRemovedByRule": dict(sorted(removed_by_rule.items())),
        "preDedupTokenCount": cleaned_tokens,
        "postDedupTokenCount": dedup_tokens,
        "deduplicatedTokenCount": cleaned_tokens - dedup_tokens,
        "sectionTokenCounts": {
            bucket: statistical_bucket_counts[bucket] for bucket in STAT_BUCKETS
        },
        "sectionFragmentTokenCounts": dict(sorted(section_type_counts.items())),
        "sectionDuplicateCount": sum(1 for item in duplicates if item["level"] == level),
        "sectionDuplicates": [item for item in duplicates if item["level"] == level],
        "cetWordsMatchedTokenCount": matched_count,
        "cetWordsMatchRate": round(matched_count / total_count, 4) if total_count else 0,
        "unmatchedTokenCount": total_count - matched_count,
        "unmatchedRate": round((total_count - matched_count) / total_count, 4)
        if total_count
        else 0,
        "exactHeadwordTokenCount": exact_count,
        "inflectionMergedTokenCount": inflection_count,
        "ambiguousSurfaceCount": len(ambiguous),
        "ambiguousTokenCount": sum(item["tokenCount"] for item in ambiguous.values()),
        "ambiguousForms": sorted(
            ambiguous.values(), key=lambda item: (-item["tokenCount"], item["surface"])
        )[:200],
        "topUnmatchedTokens": [
            {"surface": surface, "tokenCount": count}
            for surface, count in unmatched.most_common(100)
        ],
        "tierDistribution": tier_distribution,
        "sessionCoverageDistribution": session_coverage_distribution,
        "paperCoverageDistribution": paper_coverage_distribution,
        "zeroOccurrenceWordCount": tier_distribution.get("E", 0),
        "zeroOccurrenceRate": round(tier_distribution.get("E", 0) / len(words), 4),
        "concentratedFrequencyThreshold": concentration_threshold,
        "concentratedFrequencyWords": [
            {
                "word": item["word"],
                "tokenCount": item["tokenCount"],
                "sessionCount": item["sessionCount"],
            }
            for item in words
            if item["concentratedFrequency"]
        ],
        "sampleWords": sample_results,
        "auditListsNotice": "Quality audit only; these lists do not define future learning order.",
        "top100BySessionCoverageRate": top_list("sessionCoverageRate"),
        "top100ByPaperCoverageRate": top_list("paperCoverageRate"),
        "top100ByTokenCount": top_list("tokenCount"),
    }
    return output, report


def assert_no_forbidden_keys(value: Any, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in FORBIDDEN_OUTPUT_KEYS and ".surfaceFormCounts" not in path:
                raise AssertionError(f"Forbidden output key at {path}.{key}")
            assert_no_forbidden_keys(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            assert_no_forbidden_keys(child, f"{path}[{index}]")


def markdown_table(headers: Sequence[str], rows: Iterable[Sequence[Any]]) -> str:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(str(value) for value in row) + " |")
    return "\n".join(lines)


def build_corpus_doc(report: dict[str, Any]) -> str:
    return f"""# CET 真题词频语料说明

## 统计口径

本项目的第一版正式考试词频仅使用 2021-06 至 2025-12 的 CET4/CET6 真题 PDF。它准确表示为：**基于 2021-2025 CET4/CET6 真题 PDF 中可直接提取的英文卷面与阅读语料所生成的考试词频统计**。

- CET4：{report['levels']['cet4']['sessionCount']} 个考试场次，{report['levels']['cet4']['paperCount']} 份文件。
- CET6：{report['levels']['cet6']['sessionCount']} 个考试场次，{report['levels']['cet6']['paperCount']} 份文件。
- 2018-2020 文件为 `auxiliaryOnly`，不参与正式统计或频率档。
- 未使用 OCR；所有主语料均通过 PDF 文本层提取。
- 当前文件不含完整听力原文，因此 `printedListeningTokenCount` 只表示卷面真实印出的听力说明、题干或选项，不能当作听力对话/讲座正文。
- Translation 只统计原卷真实出现的英文 token，绝不把中文翻译后再统计。

## Section 拆分

每份完整试卷拆分为 `writing_prompt`、`listening_printed`、`reading_cloze`、`reading_matching`、`reading_careful`、`translation_prompt`；阅读和听力中的印刷题目再分类为 `question_stems` 与 `options`。无法可靠划分的文件会被排除并报告，不会整卷混合统计。

## 清洗与去重

固定考试说明使用 `scripts/cet-boilerplate-patterns.json` 中保守、可审计的规则删除。每个 section 经 Unicode NFKC、空白规范化、boilerplate 清理和仅用于 hash 的小写化后计算 SHA-256。同一 `level + session` 的相同 section 只累计一次 token，但保留全部 `appearedInPapers`，用于 paper 覆盖率。

2022-06 CET4/CET6 第 3 套均只有独立作文与翻译。构建器不会复制第 2 套公共正文，只把第 2 套公共 section 的 paper 覆盖传播到第 3 套；所以 token 只统计一次，而 `paperCount` 仍反映公共内容覆盖两套试卷。

## 词形归并

先做 exact headword 匹配，再使用可审计的 `-s/-es/-ies/-ves/-ed/-ied/-ing` 规则生成现有 CETWords 候选。唯一候选才归并；多个候选进入 ambiguous report，无法确定时保持 unmatched。没有使用 Porter Stem。正式词频只包含 `data/cet4.json` 或 `data/cet6.json` 中已有 headword，零出现词仍保留。

## 频率档

频率档为 S/A/B/C/D/E，不是严格排名。非零词先按 0.05 的 `tierBoundaryTolerance` 量化综合覆盖分数，再对真实分布做一维 k-means：`sessionCoverageRate` 权重 0.80，`paperCoverageRate` 权重 0.18，`logTokenCount` 权重 0.02。零出现词固定为 E。同档内部没有顺序意义，JSON 按 word 字母序稳定输出。

## 版权与可复现性

`local-corpus/` 必须被 Git 忽略。可提交输出只保存 paperId、section hash、token 数和聚合统计，不保存完整真题、passage、听力文本、题目长段、答案解析、上下文摘录或来源句子。
"""


def build_report_doc(report: dict[str, Any]) -> str:
    sections = [
        "# CET 真题词频质量报告",
        "",
        f"构建器版本：{report['builderVersion']}。本报告中的 Top 列表只用于质量审计，不代表未来学习顺序。",
        "",
        "## 主语料字符级清洗",
        "",
        markdown_table(
            ("异常类型", "清洗前", "清洗后"),
            (
                (
                    key,
                    report["extractionDiagnostics"].get(key, 0),
                    report["postCharacterCleanupDiagnostics"].get(key, 0),
                )
                for key in (
                    "replacementCharacterCount",
                    "privateUseCharacterCount",
                    "abnormalControlCharacterCount",
                )
            ),
        ),
        "",
        "所有异常字符均仅按字符级规则删除；未尝试猜测或恢复无法识别的单词，未使用 OCR。",
        "",
    ]
    for level in LEVELS:
        item = report["levels"][level]
        label = level.upper()
        sections.extend(
            [
                f"## {label}",
                "",
                markdown_table(
                    ("指标", "结果"),
                    (
                        ("正式 session", item["sessionCount"]),
                        ("正式 paper", item["paperCount"]),
                        ("完整/部分卷", f"{item['completePaperCount']} / {item['partialPaperCount']}"),
                        ("raw token", item["rawTokenCount"]),
                        ("cleaned token", item["cleanedTokenCount"]),
                        ("boilerplate 删除", item["boilerplateRemovedTokenCount"]),
                        ("去重前/后 token", f"{item['preDedupTokenCount']} / {item['postDedupTokenCount']}"),
                        ("重复 section", item["sectionDuplicateCount"]),
                        ("CETWords 匹配率", f"{item['cetWordsMatchRate']:.2%}"),
                        ("unmatched 比例", f"{item['unmatchedRate']:.2%}"),
                        ("词形归并 token", item["inflectionMergedTokenCount"]),
                        ("ambiguous forms", item["ambiguousSurfaceCount"]),
                        ("零出现词", f"{item['zeroOccurrenceWordCount']} ({item['zeroOccurrenceRate']:.2%})"),
                    ),
                ),
                "",
                "### 统计桶 token（去重后、清洗后）",
                "",
                markdown_table(
                    ("section", "token"), item["sectionTokenCounts"].items()
                ),
                "",
                "### FrequencyTier 分布",
                "",
                markdown_table(("tier", "词数"), item["tierDistribution"].items()),
                "",
                "### 重点抽样词",
                "",
                markdown_table(
                    (
                        "word",
                        "token",
                        "paper",
                        "session",
                        "paper coverage",
                        "session coverage",
                        "tier",
                        "surface forms",
                    ),
                    (
                        (
                            word,
                            sample["tokenCount"],
                            sample["paperCount"],
                            sample["sessionCount"],
                            f"{sample['paperCoverageRate']:.2%}",
                            f"{sample['sessionCoverageRate']:.2%}",
                            sample["frequencyTier"],
                            ", ".join(
                                f"{surface}:{count}"
                                for surface, count in sample["surfaceFormCounts"].items()
                            ) or "-",
                        )
                        if sample
                        else (word, "not in level vocabulary", "-", "-", "-", "-", "-", "-")
                        for word, sample in item["sampleWords"].items()
                    ),
                ),
                "",
                "### Top unmatched tokens（前 30）",
                "",
                markdown_table(
                    ("surface", "token"),
                    (
                        (entry["surface"], entry["tokenCount"])
                        for entry in item["topUnmatchedTokens"][:30]
                    ),
                ),
                "",
            ]
        )
    sections.extend(
        [
            "## 特殊处理与警告",
            "",
            "- 2022-06 CET4/CET6 第 3 套只保留独立作文和翻译；第 2 套公共 section 仅统计一次，并为覆盖率标注到第 3 套。",
            "- 主语料 U+FFFD、私用区字符和异常控制字符的实际计数见 `data/cet-frequency-report.json`；未凭空恢复任何单词，未使用 OCR。",
            "- 当前无 listening transcript，不能把本结果描述成完整听力正文词频。",
            "- 混合在中文字符中的拉丁碎片被保守丢弃并记 warning，避免把文本层识别碎片误当成单词。",
            "- 完全相同 section 才自动去重；token 相似度不低于 0.90 的非完全重复 section 进入 JSON 的 `nearDuplicateSectionAudit`，不凭相似度自动删除真实独立题目。",
            "- `concentratedFrequency` 标记 token 很高但仅集中在不超过两个 session 的词，供人工复核。",
            "",
            "## 第 13B 前人工验收",
            "",
            "请重点检查频率档分布、Top unmatched、ambiguous forms、零频比例、重点抽样词，以及 CET4/CET6 的差异。确认后再单独进入第 13B；本阶段没有接入学习顺序。",
            "",
        ]
    )
    return "\n".join(sections)


def build(project_root: Path) -> dict[Path, str]:
    manifest_path = project_root / "local-corpus" / "corpus-manifest.json"
    patterns_path = project_root / "scripts" / "cet-boilerplate-patterns.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    patterns_config, rules = load_boilerplate_rules(patterns_path)

    protected_paths = [
        project_root / "data" / "cet4.json",
        project_root / "data" / "cet6.json",
        project_root / "js" / "storage.js",
        project_root / "worker" / "src" / "index.js",
    ]
    protected_hashes = {
        path.relative_to(project_root).as_posix(): sha256_file(path) for path in protected_paths
    }
    word_id_hashes = {}
    for level in LEVELS:
        data = json.loads((project_root / "data" / f"{level}.json").read_text(encoding="utf-8"))
        word_id_hashes[level] = sha256_bytes(
            "\n".join(f"{item['word']}\t{item['id']}" for item in data).encode("utf-8")
        )

    papers: list[Paper] = []
    for level in LEVELS:
        candidates = manifest_primary_candidates(manifest, level)
        if len(candidates) != EXPECTED_PAPERS_PER_LEVEL:
            raise RuntimeError(
                f"Expected {EXPECTED_PAPERS_PER_LEVEL} primary {level} papers, got {len(candidates)}"
            )
        for candidate in candidates:
            papers.append(extract_paper(project_root, candidate, rules))
    excluded = [paper.paper_id for paper in papers if paper.exclude_from_corpus]
    if excluded:
        raise RuntimeError(f"Primary papers excluded after section parsing: {excluded}")

    unique_sections, duplicates = deduplicate_sections(papers)
    near_duplicates = audit_near_duplicate_sections(papers)
    outputs: dict[str, dict[str, Any]] = {}
    level_reports: dict[str, dict[str, Any]] = {}
    for level in LEVELS:
        output, level_report = analyze_level(
            level,
            papers,
            unique_sections,
            project_root / "data" / f"{level}.json",
            duplicates,
        )
        outputs[level] = output
        level_reports[level] = level_report

    extraction_totals = Counter()
    for paper in papers:
        extraction_totals.update(paper.extraction_diagnostics)
    cleaned_abnormal_characters = {
        "replacementCharacterCount": 0,
        "privateUseCharacterCount": 0,
        "abnormalControlCharacterCount": 0,
    }
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "builderVersion": BUILDER_VERSION,
        "corpusDescription": "2021-2025 CET PDF printed English and reading corpus; no listening transcript and no OCR",
        "primaryStats": {"from": "2021-06", "to": "2025-12"},
        "auxiliaryOnlyYears": [2018, 2019, 2020],
        "ocrUsed": False,
        "listeningTranscriptIncluded": False,
        "boilerplatePatternsSha256": sha256_file(patterns_path),
        "boilerplatePatternCount": len(patterns_config["patterns"]),
        "protectedInputSha256": protected_hashes,
        "wordIdMappingSha256": word_id_hashes,
        "extractionDiagnostics": dict(sorted(extraction_totals.items())),
        "postCharacterCleanupDiagnostics": cleaned_abnormal_characters,
        "answerPollutionPaperCount": sum(paper.answer_pollution_detected for paper in papers),
        "excludedPaperCount": sum(paper.exclude_from_corpus for paper in papers),
        "nearDuplicateSectionAudit": near_duplicates,
        "levels": level_reports,
        "papers": [paper.audit_record() for paper in sorted(papers, key=lambda p: p.paper_id)],
    }
    for value in (*outputs.values(), report):
        assert_no_forbidden_keys(value)

    files: dict[Path, str] = {
        project_root / "data" / "cet4-exam-frequency.json": stable_json(outputs["cet4"]),
        project_root / "data" / "cet6-exam-frequency.json": stable_json(outputs["cet6"]),
        project_root / "data" / "cet-frequency-report.json": stable_json(report),
        project_root / "docs" / "CET_FREQUENCY_CORPUS.md": build_corpus_doc(report),
        project_root / "docs" / "CET_FREQUENCY_REPORT.md": build_report_doc(report),
    }
    return files


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    root = args.project_root.resolve()
    files = build(root)
    if args.check:
        mismatches = []
        for path, expected in files.items():
            actual = path.read_text(encoding="utf-8") if path.exists() else None
            if actual != expected:
                mismatches.append(path.relative_to(root).as_posix())
        if mismatches:
            print("Generated files are stale or missing: " + ", ".join(mismatches), file=sys.stderr)
            return 1
    else:
        for path, content in files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")
    if not args.quiet:
        report = json.loads(files[root / "data" / "cet-frequency-report.json"])
        for level in LEVELS:
            item = report["levels"][level]
            print(
                f"{level.upper()}: {item['sessionCount']} sessions, "
                f"{item['paperCount']} papers, {item['postDedupTokenCount']} cleaned/dedup tokens, "
                f"match {item['cetWordsMatchRate']:.2%}"
            )
        print("CHECK OK" if args.check else "BUILD OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

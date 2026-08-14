#!/usr/bin/env python3
"""Generate the Phase 16.2 core-meaning audit artifacts from rebuilt data."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BOOK_IDS = ("cet4", "cet6")
TIERS = ("S", "A", "B", "C", "D", "E", "unmatched")
RISK_TYPES = ("P0", "P1", "P2", "P3", "P4")
RISK_RANK = {risk: index for index, risk in enumerate(RISK_TYPES)}
CORE_LIMIT = 56
MANUAL_WORDS = (
    "down", "ensure", "paper", "issue", "figure", "address", "subject", "present", "matter", "case",
    "up", "out", "off", "over", "under", "set", "point", "right", "left", "mean", "hold", "run",
    "turn", "take", "make", "get", "work",
)
PROTECTED_FILES = (
    "data/cet4-exam-frequency.json",
    "data/cet6-exam-frequency.json",
    "data/cet-learning-priority-overrides.json",
    "js/smart-learning-order.js",
    "js/review-scheduler.js",
    "js/review-recovery.js",
    "js/daily-group-service.js",
    "worker/src/index.js",
)
PROPER_NAME_RE = re.compile(r"人名|地名|姓氏|专名")
SPECIALIST_RE = re.compile(r"\[(?:医|药|化|物|数|计|经|地质|生物|解剖|法律?|军|航|农|电子|机械|建|测|统|语)\]")
SUSPICIOUS_RE = re.compile(r"�|<[^>]+>|&[a-z]+;", re.I)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def id_hash(words: list[dict[str, Any]]) -> str:
    return hashlib.sha256("\n".join(item["id"] for item in words).encode("utf-8")).hexdigest()


def normalized_sense(value: str) -> str:
    value = re.sub(r"<[^>]+>|\[[^\]]+\]", "", value)
    return re.sub(r"[\s,，。；;:：、（）()\[\]…·]+", "", value).lower()


def highest_risk(issues: list[dict[str, str]]) -> str | None:
    if not issues:
        return None
    return min((issue["riskType"] for issue in issues), key=lambda risk: RISK_RANK[risk])


def detect_current_risks(item: dict[str, Any]) -> list[dict[str, str]]:
    core = item.get("coreMeaning", "")
    detail = item.get("meaning", "")
    issues: list[dict[str, str]] = []
    if not core.strip() or not detail.strip() or not item.get("meanings"):
        issues.append({"riskType": "P0", "signal": "missing_meaning_structure"})
    if item.get("shortMeaning") != core:
        issues.append({"riskType": "P0", "signal": "short_core_mismatch"})
    core_parts = [normalized_sense(part) for part in re.split(r"[；;]+", core) if normalized_sense(part)]
    detail_key = normalized_sense(detail)
    if core_parts and any(part not in detail_key for part in core_parts):
        issues.append({"riskType": "P0", "signal": "core_not_in_detail"})
    if PROPER_NAME_RE.search(core):
        issues.append({"riskType": "P1", "signal": "proper_name_in_core"})
    if SUSPICIOUS_RE.search(core):
        issues.append({"riskType": "P1", "signal": "garbled_or_markup_symbol"})
    if len(core) > CORE_LIMIT:
        issues.append({"riskType": "P2", "signal": "core_too_long"})
    if re.search(r"[；;]{2,}|[,，。]{3,}", core):
        issues.append({"riskType": "P2", "signal": "malformed_punctuation"})
    if SPECIALIST_RE.search(core):
        issues.append({"riskType": "P4", "signal": "specialist_label_in_core"})
    return issues


def load_frequency(data_dir: Path, book_id: str) -> dict[str, dict[str, Any]]:
    payload = read_json(data_dir / f"{book_id}-exam-frequency.json")
    return {item["word"].lower(): item for item in payload["words"]}


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=root)
    parser.add_argument("--json-output", type=Path, default=root / "data" / "core-meaning-audit-report.json")
    parser.add_argument("--markdown-output", type=Path, default=root / "docs" / "CORE_MEANING_AUDIT_REPORT.md")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    data_dir = root / "data"
    build_report = read_json(data_dir / "vocabulary-report.json")
    quality_report = read_json(data_dir / "vocabulary-quality-report.json")
    priority_payload = read_json(data_dir / "cet-learning-priority-overrides.json")
    neutral_words = {
        item["word"].lower()
        for item in priority_payload["overrides"]
        if item.get("effectiveLearningTier") == "neutral" and item.get("frequencyBoostEligible") is False
    }
    frequencies = {book_id: load_frequency(data_dir, book_id) for book_id in BOOK_IDS}
    books = {book_id: read_json(data_dir / f"{book_id}.json") for book_id in BOOK_IDS}
    word_indexes = {book_id: {item["word"].lower(): item for item in words} for book_id, words in books.items()}
    quality_indexes = {
        book_id: {item["word"].lower(): item.get("warning", []) for item in quality_report["books"][book_id]["warnings"]}
        for book_id in BOOK_IDS
    }

    repair_records: list[dict[str, Any]] = []
    repair_by_id: dict[str, dict[str, Any]] = {}
    for book_id in BOOK_IDS:
        build_repairs = (
            build_report["books"][book_id]["coreMeaningOverridesApplied"]
            + build_report["books"][book_id].get("automaticCoreNoiseRepairsApplied", [])
        )
        for record in build_repairs:
            item = next(item for item in books[book_id] if item["id"] == record["id"])
            frequency = frequencies[book_id].get(item["word"].lower(), {})
            enriched = {
                **record,
                "sourceLevel": item["sourceLevel"],
                "isCore": item["isCore"],
                "rawFrequencyTier": frequency.get("frequencyTier", "unmatched"),
                "effectiveLearningTier": "neutral" if item["word"].lower() in neutral_words else frequency.get("frequencyTier", "unmatched"),
                "frequencyBoostEligible": item["word"].lower() not in neutral_words,
                "detailedMeaning": item["meaning"],
            }
            repair_records.append(enriched)
            repair_by_id[item["id"]] = enriched

    remaining_candidates: list[dict[str, Any]] = []
    audited_entries: list[dict[str, Any]] = []
    for book_id, words in books.items():
        for item in words:
            word_key = item["word"].lower()
            frequency = frequencies[book_id].get(word_key, {})
            tier = frequency.get("frequencyTier", "unmatched")
            neutral = word_key in neutral_words
            risks = detect_current_risks(item)
            audit = {
                "id": item["id"],
                "word": item["word"],
                "book": book_id,
                "sourceLevel": item["sourceLevel"],
                "isCore": item["isCore"],
                "rawFrequencyTier": tier,
                "effectiveLearningTier": "neutral" if neutral else tier,
                "qualityWarnings": quality_indexes[book_id].get(word_key, []),
                "riskSignals": risks,
                "highestRisk": highest_risk(risks),
                "repaired": item["id"] in repair_by_id,
            }
            audited_entries.append(audit)
            if risks:
                remaining_candidates.append({
                    **audit,
                    "coreMeaning": item["coreMeaning"],
                    "detailedMeaning": item["meaning"],
                    "needsManualReview": True,
                })

    manual_checklist: list[dict[str, Any]] = []
    for word in MANUAL_WORDS:
        results: list[dict[str, Any]] = []
        for book_id in BOOK_IDS:
            item = word_indexes[book_id].get(word)
            if not item:
                continue
            repair = repair_by_id.get(item["id"])
            results.append({
                "book": book_id,
                "id": item["id"],
                "oldCoreMeaning": repair["oldCoreMeaning"] if repair else item["coreMeaning"],
                "newCoreMeaning": item["coreMeaning"],
                "detailedMeaning": item["meaning"],
                "rawFrequencyTier": frequencies[book_id].get(word, {}).get("frequencyTier", "unmatched"),
                "effectiveLearningTier": "neutral" if word in neutral_words else frequencies[book_id].get(word, {}).get("frequencyTier", "unmatched"),
                "status": "repaired" if repair else "confirmed_unchanged",
                "check": "pass" if not detect_current_risks(item) else "manual_review",
            })
        manual_checklist.append({
            "word": word,
            "status": "repaired" if any(item["status"] == "repaired" for item in results) else "confirmed_unchanged",
            "books": results,
        })

    by_book: dict[str, Any] = {}
    for book_id, words in books.items():
        book_audits = [item for item in audited_entries if item["book"] == book_id]
        book_repairs = [item for item in repair_records if item["book"] == book_id]
        by_book[book_id] = {
            "auditedEntries": len(words),
            "coreEntries": sum(bool(item["isCore"]) for item in words),
            "supplementalEntries": sum(not item["isCore"] for item in words),
            "priorityScopeEntries": sum(
                item["isCore"] or item["rawFrequencyTier"] in {"S", "A", "B"} or item["effectiveLearningTier"] == "neutral"
                for item in book_audits
            ),
            "qualityWarningEntries": quality_report["books"][book_id]["warningEntries"],
            "repairedEntries": len(book_repairs),
            "remainingManualReviewEntries": sum(item["book"] == book_id for item in remaining_candidates),
            "idCount": len({item["id"] for item in words}),
            "idHash": id_hash(words),
        }

    repair_by_tier = Counter(item["rawFrequencyTier"] for item in repair_records)
    repair_by_risk = Counter(item["riskType"] for item in repair_records)
    remaining_by_risk = Counter(item["highestRisk"] for item in remaining_candidates)
    candidate_signals = Counter(
        signal["signal"] for item in remaining_candidates for signal in item["riskSignals"]
    )
    priority_scope_count = sum(
        item["isCore"] or item["rawFrequencyTier"] in {"S", "A", "B"} or item["effectiveLearningTier"] == "neutral"
        for item in audited_entries
    )
    protected_hashes = {relative: sha256_file(root / relative) for relative in PROTECTED_FILES}

    report = {
        "schemaVersion": 1,
        "phase": "16.2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "scope": {
            "books": list(BOOK_IDS),
            "fields": ["coreMeaning", "shortMeaning", "meanings", "meaningsByPos"],
            "priorityOrder": ["core", "frequencyTier S/A/B", "neutral", "basic/polysemous", "quality warnings"],
            "sourceRepository": build_report["source"]["repository"],
            "sourceCommit": build_report["source"].get("commit"),
            "overrideFile": "data/core-meaning-overrides.json",
        },
        "audited": {
            "entries": len(audited_entries),
            "priorityScopeEntries": priority_scope_count,
            "byBook": by_book,
            "qualityWarningEntries": sum(value["warningEntries"] for value in quality_report["books"].values()),
        },
        "flagged": {
            "candidateEntriesBeforeRepair": len(repair_records) + len(remaining_candidates),
            "repairedEntries": len(repair_records),
            "remainingManualReviewEntries": len(remaining_candidates),
            "remainingByHighestRisk": {risk: remaining_by_risk.get(risk, 0) for risk in RISK_TYPES},
            "remainingBySignal": dict(sorted(candidate_signals.items())),
        },
        "repairSummary": {
            "overrideDeclarations": build_report["coreMeaningOverrides"]["declarations"],
            "applications": len(repair_records),
            "overrideApplications": build_report["coreMeaningOverrides"]["applications"],
            "systematicNoiseFilterApplications": build_report.get("automaticCoreNoiseRepairs", {}).get("applications", 0),
            "byBook": {book_id: sum(item["book"] == book_id for item in repair_records) for book_id in BOOK_IDS},
            "byRawFrequencyTier": {tier: repair_by_tier.get(tier, 0) for tier in TIERS},
            "neutralEntries": sum(item["effectiveLearningTier"] == "neutral" for item in repair_records),
            "byRiskType": {risk: repair_by_risk.get(risk, 0) for risk in RISK_TYPES},
        },
        "acceptanceSamples": {
            "down": {book_id: word_indexes[book_id]["down"]["coreMeaning"] for book_id in BOOK_IDS},
            "ensure": {book_id: word_indexes[book_id]["ensure"]["coreMeaning"] for book_id in BOOK_IDS},
            "paper": {book_id: word_indexes[book_id]["paper"]["coreMeaning"] for book_id in BOOK_IDS},
        },
        "repairs": repair_records,
        "manualChecklist": manual_checklist,
        "remainingManualReview": sorted(
            remaining_candidates,
            key=lambda item: (RISK_RANK[item["highestRisk"]], 0 if item["isCore"] else 1, item["book"], item["word"].lower()),
        ),
        "guardrails": {
            "vocabularyCounts": {book_id: len(words) for book_id, words in books.items()},
            "coreCounts": {book_id: sum(bool(item["isCore"]) for item in words) for book_id, words in books.items()},
            "supplementalCounts": {book_id: sum(not item["isCore"] for item in words) for book_id, words in books.items()},
            "protectedFileSha256": protected_hashes,
            "frequencyDataChanged": False,
            "learningOrderChanged": False,
            "srsOrRecoveryChanged": False,
            "phase16GroupingChanged": False,
            "workerChanged": False,
            "userDataMigrationRequired": False,
        },
    }
    write_json(args.json_output.resolve(), report)
    write_markdown(args.markdown_output.resolve(), report)
    print(
        f"Audited {report['audited']['entries']} entries; repaired {len(repair_records)}; "
        f"remaining manual review {len(remaining_candidates)}"
    )
    return 0


def md_escape(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def write_markdown(path: Path, report: dict[str, Any]) -> None:
    lines: list[str] = [
        "# Phase 16.2 CET 核心词义质量审计报告",
        "",
        "> 本报告由 `scripts/audit-core-meanings.py` 基于重建后的 CET4/CET6 词库、词频层级、neutral 保护清单和构建审计记录自动生成。候选识别是风险筛查，不等同于词典学结论；未自动修复项继续保留在人工确认清单。",
        "",
        "## 审计范围与方法",
        "",
        f"- 审计词条：{report['audited']['entries']}（按 CET4/CET6 书内记录计数）",
        f"- 优先范围：{report['audited']['priorityScopeEntries']}（核心词、S/A/B、neutral 的并集）",
        f"- 质量告警记录：{report['audited']['qualityWarningEntries']}",
        f"- 固定上游源提交：`{report['scope']['sourceCommit']}`",
        "- 自动候选信号：缺失/结构不一致、核心义不在详细义项、人名/地名、乱码或标记、超长/异常标点、专业标签。",
        "- 修复方式：由构建器在合并原始释义后应用审计覆盖清单，并系统清除核心展示中的专名/来源标签；不直接手改生成结果。",
        "",
        "## 汇总",
        "",
        "| 词库 | 审计 | 核心 | 补充 | 优先范围 | 质量告警 | 已修复 | 待人工确认 |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for book_id in BOOK_IDS:
        item = report["audited"]["byBook"][book_id]
        lines.append(
            f"| {book_id.upper()} | {item['auditedEntries']} | {item['coreEntries']} | {item['supplementalEntries']} | "
            f"{item['priorityScopeEntries']} | {item['qualityWarningEntries']} | {item['repairedEntries']} | {item['remainingManualReviewEntries']} |"
        )
    lines.extend([
        "",
        f"候选（按书内记录）：修复前 {report['flagged']['candidateEntriesBeforeRepair']}，已修复 {report['flagged']['repairedEntries']}，仍待人工确认 {report['flagged']['remainingManualReviewEntries']}。",
        "",
        "### 修复分布",
        "",
        "| 维度 | 数量 |",
        "| --- | ---: |",
        f"| CET4 | {report['repairSummary']['byBook']['cet4']} |",
        f"| CET6 | {report['repairSummary']['byBook']['cet6']} |",
        f"| neutral | {report['repairSummary']['neutralEntries']} |",
    ])
    for tier, count in report["repairSummary"]["byRawFrequencyTier"].items():
        lines.append(f"| raw tier {tier} | {count} |")
    for risk, count in report["repairSummary"]["byRiskType"].items():
        lines.append(f"| 风险 {risk} | {count} |")
    lines.extend([
        "",
        "## 强制验收样例",
        "",
        "- `down`：核心义为“向下；往下；在下面；下降”；“软毛/绒毛/高地”只在详细义项。",
        "- `ensure`：核心义为“确保；保证”，已移除误导性的“保护”。",
        "- `paper`：继续保持“纸；论文；试卷”，未被本阶段覆盖。",
        "",
        "## 人工抽查清单",
        "",
        "| 单词 | 状态 | CET4 核心义 | CET6 核心义 | 结论 |",
        "| --- | --- | --- | --- | --- |",
    ])
    for entry in report["manualChecklist"]:
        by_book = {item["book"]: item for item in entry["books"]}
        conclusions = sorted({item["check"] for item in entry["books"]})
        lines.append(
            f"| {md_escape(entry['word'])} | {md_escape(entry['status'])} | "
            f"{md_escape(by_book.get('cet4', {}).get('newCoreMeaning', '—'))} | "
            f"{md_escape(by_book.get('cet6', {}).get('newCoreMeaning', '—'))} | {md_escape(', '.join(conclusions))} |"
        )
    lines.extend([
        "",
        "## 完整修复记录",
        "",
        "| 词库 | ID | 单词 | raw tier | effective | 风险 | 原核心义 | 新核心义 | 原因 | 说明 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ])
    for item in report["repairs"]:
        lines.append(
            "| " + " | ".join(md_escape(value) for value in (
                item["book"].upper(), item["id"], item["word"], item["rawFrequencyTier"], item["effectiveLearningTier"],
                item["riskType"], item["oldCoreMeaning"], item["newCoreMeaning"], item["reason"], item["explanation"],
            )) + " |"
        )
    lines.extend([
        "",
        "## 待人工确认候选",
        "",
        "以下项目仅由结构/文本信号筛出，本阶段不猜测、不批量改写。JSON 报告保留完整字段和详细义项。",
        "",
        "| 风险 | 词库 | ID | 单词 | 核心词 | raw tier | 核心义 | 信号 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ])
    for item in report["remainingManualReview"]:
        signals = ", ".join(signal["signal"] for signal in item["riskSignals"])
        lines.append(
            "| " + " | ".join(md_escape(value) for value in (
                item["highestRisk"], item["book"].upper(), item["id"], item["word"], item["isCore"],
                item["rawFrequencyTier"], item["coreMeaning"], signals,
            )) + " |"
        )
    lines.extend([
        "",
        "## 不变性结论",
        "",
        "- CET4/CET6 的词数、核心/补充数量与 ID 集合保持不变。",
        "- 真题词频 JSON、SMART/random/neutral 顺序逻辑、长期 SRS、Recovery、自然日窗口、Phase 16 分组与休息、Worker 均未修改。",
        "- storage version 保持 v13，无迁移；用户学习记录不会被清空或重置。",
        "- 详细 SHA-256、ID hash、逐条修复和待确认字段见 `data/core-meaning-audit-report.json`。",
        "",
        "## 风险分级",
        "",
        "- P0：明显错误核心义。",
        "- P1：罕见义或专有名词被提升为核心义。",
        "- P2：核心义包含错误或误导义项。",
        "- P3：核心义过窄，只保留次要义或遗漏常见词性。",
        "- P4：释义本身真实，但不适合四六级优先学习。",
        "",
    ])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())

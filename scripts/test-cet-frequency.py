#!/usr/bin/env python3
"""Regression tests for the phase 13A.2 CET frequency builder."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / "scripts" / "build-cet-frequency.py"
spec = importlib.util.spec_from_file_location("cet_frequency_builder", BUILDER_PATH)
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
assert spec.loader is not None
spec.loader.exec_module(builder)


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class CetFrequencyBuilderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.generated = builder.build(ROOT)
        cls.cet4 = json.loads(cls.generated[ROOT / "data" / "cet4-exam-frequency.json"])
        cls.cet6 = json.loads(cls.generated[ROOT / "data" / "cet6-exam-frequency.json"])
        cls.report = json.loads(cls.generated[ROOT / "data" / "cet-frequency-report.json"])
        cls.cet4_words = {item["word"]: item for item in cls.cet4["words"]}
        cls.cet6_words = {item["word"]: item for item in cls.cet6["words"]}

    def test_01_only_2021_2025_enter_primary_stats(self) -> None:
        self.assertEqual(self.report["primaryStats"], {"from": "2021-06", "to": "2025-12"})
        years = {int(paper["session"][:4]) for paper in self.report["papers"]}
        self.assertEqual(years, {2021, 2022, 2023, 2024, 2025})

    def test_02_auxiliary_years_do_not_affect_tiers(self) -> None:
        self.assertEqual(self.report["auxiliaryOnlyYears"], [2018, 2019, 2020])
        for level in (self.cet4, self.cet6):
            self.assertEqual(level["corpus"]["auxiliaryYearsExcluded"], [2018, 2019, 2020])

    def test_03_levels_are_separate(self) -> None:
        self.assertEqual(self.cet4["level"], "cet4")
        self.assertEqual(self.cet6["level"], "cet6")
        self.assertIn("term", self.cet4_words)
        self.assertNotIn("term", self.cet6_words)

    def test_04_partial_set3_is_not_a_full_copy(self) -> None:
        partials = {paper["paperId"]: paper for paper in self.report["papers"] if paper["status"] == "partial"}
        self.assertEqual(set(partials), {"cet4-2022-06-3", "cet6-2022-06-3"})
        for paper in partials.values():
            self.assertEqual(paper["sharesCommonSectionsWithSet"], 2)
            self.assertEqual(
                {section["sectionType"] for section in paper["sections"]},
                {"writing_prompt", "translation_prompt"},
            )

    def test_05_section_hash_is_normalized_and_stable(self) -> None:
        self.assertEqual(builder.section_hash(" Issue \n PAPER "), builder.section_hash("issue paper"))

    def test_06_shared_section_token_count_is_deduplicated(self) -> None:
        left = builder.Section("cet4-x-1", "cet4", "2024-06", 1, "reading_careful", "issue issue")
        right = builder.Section("cet4-x-2", "cet4", "2024-06", 2, "reading_careful", "issue issue")
        _, rules = builder.load_boilerplate_rules(ROOT / "scripts" / "cet-boilerplate-patterns.json")
        builder.clean_section(left, rules)
        builder.clean_section(right, rules)
        unique, duplicates = builder.deduplicate_sections(
            [
                builder.Paper("cet4-x-1", "cet4", 2024, "06", 1, "x", False, None, [left]),
                builder.Paper("cet4-x-2", "cet4", 2024, "06", 2, "x", False, None, [right]),
            ]
        )
        self.assertEqual(sum(item.cleaned_token_count for item in unique), 2)
        self.assertEqual(len(duplicates), 1)

    def test_07_paper_count_propagates_for_2022_set3_common_sections(self) -> None:
        for words in (self.cet4_words, self.cet6_words):
            self.assertLessEqual(words["issue"]["paperCount"], 30)
            self.assertGreaterEqual(words["issue"]["paperCount"], words["issue"]["sessionCount"])

    def test_08_session_count_is_bounded(self) -> None:
        for item in self.cet4["words"] + self.cet6["words"]:
            self.assertLessEqual(item["sessionCount"], 10)

    def test_09_boilerplate_cleanup_removes_exam_templates(self) -> None:
        section = builder.Section(
            "p", "cet4", "2024-06", 1, "reading_careful",
            "Directions: There are 2 passages in this section.\nA real passage remains useful.",
        )
        _, rules = builder.load_boilerplate_rules(ROOT / "scripts" / "cet-boilerplate-patterns.json")
        builder.clean_section(section, rules)
        self.assertNotIn("Directions", section.cleaned_text)
        self.assertIn("real passage remains useful", section.cleaned_text)

    def test_10_real_passage_line_is_not_removed(self) -> None:
        section = builder.Section(
            "p", "cet4", "2024-06", 1, "reading_careful",
            "Researchers mark the corresponding change in society, not an answer sheet.",
        )
        _, rules = builder.load_boilerplate_rules(ROOT / "scripts" / "cet-boilerplate-patterns.json")
        builder.clean_section(section, rules)
        self.assertEqual(section.cleaned_token_count, section.raw_token_count)

    def test_11_answer_explanation_markers_are_absent(self) -> None:
        self.assertEqual(self.report["answerPollutionPaperCount"], 0)

    def test_12_translation_is_not_machine_translated(self) -> None:
        translation_total = 0
        for paper in self.report["papers"]:
            for section in paper["sections"]:
                if section["sectionType"] == "translation_prompt":
                    translation_total += section["cleanedTokenCount"]
        deduplicated_translation_total = sum(
            self.report["levels"][level]["sectionFragmentTokenCounts"].get("translation_prompt", 0)
            for level in builder.LEVELS
        )
        self.assertGreaterEqual(translation_total, deduplicated_translation_total)
        self.assertEqual(
            translation_total - deduplicated_translation_total,
            sum(
                duplicate["tokenCount"]
                for level in builder.LEVELS
                for duplicate in self.report["levels"][level]["sectionDuplicates"]
                if duplicate["sectionType"] == "translation_prompt"
            ),
        )
        self.assertLess(translation_total, 1000)

    def test_13_section_buckets_are_separate(self) -> None:
        required = set(builder.STAT_BUCKETS)
        for item in (self.cet4_words["issue"], self.cet6_words["issue"]):
            self.assertTrue(required.issubset(item))
            self.assertEqual(sum(item[key] for key in required), item["tokenCount"])

    def test_14_exact_headword_match(self) -> None:
        headword, resolution, _ = builder.resolve_headword("issue", {"issue"})
        self.assertEqual((headword, resolution), ("issue", "exact"))

    def test_15_inflection_merging(self) -> None:
        for surface in ("studies", "studied", "studying"):
            headword, resolution, _ = builder.resolve_headword(surface, {"study"})
            self.assertEqual((headword, resolution), ("study", "inflection"))

    def test_16_ambiguous_forms_are_not_forced(self) -> None:
        headword, resolution, candidates = builder.resolve_headword("lives", {"life", "live"})
        self.assertIsNone(headword)
        self.assertEqual(resolution, "ambiguous")
        self.assertEqual(candidates, ["life", "live"])

    def test_17_zero_frequency_words_remain(self) -> None:
        for output in (self.cet4, self.cet6):
            zero = [item for item in output["words"] if item["tokenCount"] == 0]
            self.assertTrue(zero)
            self.assertTrue(all(item["frequencyTier"] == "E" for item in zero))

    def test_18_outputs_contain_no_exam_body_fields(self) -> None:
        for path, content in self.generated.items():
            if path.suffix != ".json":
                continue
            parsed = json.loads(content)
            builder.assert_no_forbidden_keys(parsed)

    def test_19_repeated_build_is_stable(self) -> None:
        repeated = builder.build(ROOT)
        self.assertEqual(self.generated, repeated)

    def test_20_word_id_mapping_is_unchanged(self) -> None:
        for level in builder.LEVELS:
            vocab = json.loads((ROOT / "data" / f"{level}.json").read_text(encoding="utf-8"))
            digest = hashlib.sha256(
                "\n".join(f"{item['word']}\t{item['id']}" for item in vocab).encode("utf-8")
            ).hexdigest()
            self.assertEqual(self.report["wordIdMappingSha256"][level], digest)

    def test_21_vocabulary_files_are_read_only_inputs(self) -> None:
        for level in builder.LEVELS:
            path = ROOT / "data" / f"{level}.json"
            key = path.relative_to(ROOT).as_posix()
            self.assertEqual(self.report["protectedInputSha256"][key], file_hash(path))

    def test_22_storage_file_is_unchanged(self) -> None:
        path = ROOT / "js" / "storage.js"
        self.assertEqual(self.report["protectedInputSha256"][path.relative_to(ROOT).as_posix()], file_hash(path))

    def test_23_worker_is_unchanged(self) -> None:
        path = ROOT / "worker" / "src" / "index.js"
        self.assertEqual(self.report["protectedInputSha256"][path.relative_to(ROOT).as_posix()], file_hash(path))

    def test_24_primary_corpus_has_expected_sessions_and_papers(self) -> None:
        for level in builder.LEVELS:
            item = self.report["levels"][level]
            self.assertEqual(item["sessionCount"], 10)
            self.assertEqual(item["paperCount"], 30)

    def test_25_no_ocr_or_listening_transcript_claim(self) -> None:
        self.assertFalse(self.report["ocrUsed"])
        self.assertFalse(self.report["listeningTranscriptIncluded"])

    def test_26_main_character_garbled_counts_are_audited(self) -> None:
        diagnostics = self.report["extractionDiagnostics"]
        for key in (
            "replacementCharacterCount",
            "privateUseCharacterCount",
            "abnormalControlCharacterCount",
        ):
            self.assertIn(key, diagnostics)
            self.assertEqual(self.report["postCharacterCleanupDiagnostics"][key], 0)

    def test_27_generated_files_are_current(self) -> None:
        for path, expected in self.generated.items():
            self.assertTrue(path.exists(), path)
            self.assertEqual(path.read_text(encoding="utf-8"), expected)

    def test_28_frequency_files_are_alphabetical(self) -> None:
        for output in (self.cet4, self.cet6):
            words = [item["word"] for item in output["words"]]
            self.assertEqual(words, sorted(words))

    def test_29_tiers_do_not_create_ranks(self) -> None:
        for output in (self.cet4, self.cet6):
            self.assertNotIn("rank", output["words"][0])
            self.assertEqual(output["tierMethodology"]["tierBoundaryTolerance"], 0.05)

    def test_30_local_corpus_is_git_ignored(self) -> None:
        samples = []
        for level in builder.LEVELS:
            samples.append(next((ROOT / "local-corpus" / level).glob("*.pdf")))
        for sample in samples:
            result = subprocess.run(
                ["git", "check-ignore", "-q", str(sample)], cwd=ROOT, check=False
            )
            self.assertEqual(result.returncode, 0, sample)


if __name__ == "__main__":
    unittest.main(verbosity=2)

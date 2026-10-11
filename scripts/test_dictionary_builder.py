import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "dictionary_builder", Path(__file__).with_name("build_dictionary.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class DictionaryBuilderTest(unittest.TestCase):
    def test_valid_words_and_names(self):
        for word in ("Sinwar", "Netanyahu", "Hamas", "ChatGPT", "doomscrolling"):
            self.assertTrue(builder.valid(word))
        for word in ("#Hamas", "1999", "Thing_(2026)", "x/y", "me@you"):
            self.assertFalse(builder.valid(word))

    def test_wikipedia_title_component_frequency(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "titles.gz"
            with gzip.open(path, "wt", encoding="utf-8") as file:
                file.write("Yahya_Sinwar\nMohammed_Sinwar\nBenjamin_Netanyahu\n"
                           "Benjamin_Netanyahu_(politician)\nHamas\nHistory_of_Hamas\n"
                           "Hamas_and_Hezbollah\nList_of_Hamas_members\n"\n                           "Qwen\nUNRWA\n")
            counts = builder.Counter()
            words = builder.wiki_words(path, counts, minimum=2)
            self.assertIn("sinwar", words)
            self.assertIn("hamas", words)
            self.assertNotIn("netanyahu", words)
            self.assertNotIn("of", words)
            self.assertTrue(words["sinwar"][1] >= 12)

    def test_wiktionary_rejects_obsolete_and_other_languages(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "words.gz"
            records = [
                {"word": "doomscrolling", "lang_code": "en", "pos": "verb",
                 "senses": [{"glosses": ["Scrolling through bad news"]}]},
                {"word": "obsoletewurd", "lang_code": "en", "pos": "noun",
                 "senses": [{"tags": ["obsolete"]}]},
                {"word": "Bonjour", "lang_code": "fr", "pos": "noun"},
            ]
            with gzip.open(path, "wt", encoding="utf-8") as file:
                for entry in records:
                    file.write(json.dumps(entry) + "\n")
            words = builder.wiktionary_words(path, builder.Counter())
            self.assertIn("doomscrolling", words)
            self.assertNotIn("obsoletewurd", words)
            self.assertNotIn("bonjour", words)

    def test_merges_sources_deterministically(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            esdb = root / "esdb.txt"
            esdb.write_text("Hamas\nCat\nNetanyahu\n", encoding="utf-8")
            wiki = root / "wiki.gz"
            with gzip.open(wiki, "wt", encoding="utf-8") as file:
                file.write("Yahya_Sinwar\nMohammed_Sinwar\nHistory_of_Hamas\n"
                           "Hamas_and_Hezbollah\n")
            dictionary = root / "dictionary.gz"
            with gzip.open(dictionary, "wt", encoding="utf-8") as file:
                file.write(json.dumps({"word": "doomscrolling", "lang_code": "en",
                                       "pos": "verb"}) + "\n")
            meta = {k: {"revision": "fixture", "sha256": "fixture"}
                    for k in ("esdb", "wikipedia", "simplewiktionary")}
            paths = {"esdb": esdb, "wikipedia": wiki, "simplewiktionary": dictionary}
            output, report = builder.build(meta, paths)
            self.assertEqual(output, builder.build(meta, paths)[0])
            self.assertIn("Sinwar 12", output)
            self.assertIn("doomscrolling 24", output)
            self.assertIn("Netanyahu 45", output)
            self.assertGreaterEqual(report["counts"]["total"], 5)


if __name__ == "__main__":
    unittest.main()

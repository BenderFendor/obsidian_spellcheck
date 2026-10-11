# Context Spellcheck for Obsidian

An offline-first spelling checker for long-form Markdown notes. It proposes corrections without changing your prose automatically. Designed to recognize specialist terms such as Marxism, psychoanalysis, bourgeoisie, and materialism.

## Features

- About 62,000 high-frequency English words, plus a **generated** dictionary supplement compiled from the current English Speller Database, Simple English Wiktionary, and English Wikipedia proper names. New snapshots are pinned and reviewed. No network or model download is needed for basic spelling.
- SymSpell-style symmetric delete index (edit distance 2) for fast common typos, followed by an n-gram/Damerau-Levenshtein fallback for harder misspellings.
- Contextual reranking using surrounding prose and a small academic/philosophy vocabulary. This is heuristic context scoring, not a neural language model.
- Up to ten ranked replacements for an unknown word, plus a personal dictionary.
- Wavy underlines in Obsidian's editor. **Right-click a misspelled word** to see up to ten replacements directly in the native editor menu, or add that word to your personal dictionary. Right-click uses the actual clicked word, not a stale caret position. Commands for suggestions at the cursor and review of the selected text/entire note remain available.
- A review modal that shows each candidate and lets you apply it individually. No automatic or bulk rewriting.
- Bundled ReText grammar rules, independent of Harper, cover a/an, repeated words and redundant acronyms, plus optional passive-voice style advice. Legacy conservative checks remain.
- Every ReText rule is individually configurable and offline. ReText appears in the review dialog and native right-click menu, with optional inline underlines. LanguageTool remains a separate, opt-in server backend.

## Install (developer build)

Requires Node.js 18+ and npm.

1. Clone the repository and run **npm ci**, **npm test**, then **npm run build**.
2. Copy the files **main.js**, **manifest.json**, and **styles.css** into your vault folder **.obsidian/plugins/obsidian-spellcheck/**.
3. Reload Obsidian, enable **Context Spellcheck** in **Settings > Community plugins**.
4. Right-click an underlined word in editing mode to choose a correction. Or run **Review spelling and grammar in selection or note** from the command palette. Select a passage beforehand to limit review. Use **Show spelling suggestions at cursor** for up to ten alternatives.

This repository started from the Obsidian starter plugin and is not yet distributed through the community-plugin catalog.

## Offline grammar without Harper

This plugin does not use Harper or depend on its Obsidian plugin. It bundles the MIT-licensed [ReText English parser](https://github.com/retextjs/retext) and [unified](https://github.com/unifiedjs/unified) grammar rules. The existing generated dictionary and SymSpell still handle spelling, so there is no competing spelling dictionary.

Settings > Context Spellcheck provides independent toggles for:

- Article agreement (`retext-indefinite-article`): a/an, including sound-based exceptions.
- Repeated words (`retext-repeated-words`): accidental repetitions.
- Redundant acronyms (`retext-redundant-acronyms`): e.g. ATM machine.
- Passive voice (`retext-passive`): style advice, disabled by default, no automatic fixes.

Local grammar is enabled by default in the review dialog. Right-clicking affected prose also offers a grammar replacement when the rule provides one. Inline grammar underlines are opt-in to avoid extra work while typing. Every replacement requires a click, and existing Markdown masking ensures source code, inline code, links and frontmatter are not rewritten as prose. Warnings without safe replacement suggestions are informational.
## Optional contextual grammar

LanguageTool can be self-hosted. Start an instance serving its standard HTTP **/v2/check** endpoint, normally **http://127.0.0.1:8081/v2/check**, or supply another URL you trust. In plugin settings, enable **Allow LanguageTool checks**. Inside the review dialog, click **Run grammar check**. You can apply or ignore each returned suggestion. No background requests or analytics run.

For a remote endpoint, the reviewed note text or selection will leave your machine when you click the button. Do not configure a third-party service for private notes unless you accept that disclosure. LanguageTool corrections are proposals and should be evaluated for accuracy, especially around names, citations, quotations, and specialized terms.

## Accuracy and limitations

The corpus includes frequent English vocabulary, SCOWL words, specialist vocabulary and a generated, version-pinned supplement from live-maintained upstream projects. It is not exhaustive. The offline word recognizer uses conservative morphology heuristics and may propose false positives/negatives. It does not understand philosophical arguments, grammar as comprehensively as LanguageTool, or nuanced semantic mistakes such as a plausible but contextually wrong word. Context-based candidate ranking does not make a neural semantic model.

The plugin masks common Markdown syntax including YAML frontmatter, fenced and inline code, wikilinks, URLs, Markdown links, and tags. Some exotic embedded syntaxes may still be scanned. Corrections are applied by checked text offsets, and review stops if the note has changed externally to avoid editing the wrong range.

For large notes, selecting a paragraph or section before review reduces latency. The dictionary and spelling index operate locally, with candidate indexes constructed on demand.

## License and dictionary sources

Application code: [0BSD](LICENSE). ReText and the unified grammar dependencies are MIT licensed; see their respective upstream notices. The bundled word list combines:

- TextBlob English spelling frequencies, from [TextBlob](https://github.com/sloria/TextBlob/blob/dev/src/textblob/en/en-spelling.txt); see [TextBlob license](docs/TEXTBLOB-LICENSE.txt). Its source states the counts derive from Project Gutenberg, Wiktionary, the British National Corpus and Peter Norvig's corpus.
- English en_US Hunspell word stems derived from SCOWL, by Kevin Atkinson, from [LibreOffice dictionaries](https://github.com/LibreOffice/dictionaries/tree/master/en); see [SCOWL copyright and notices](docs/SCOWL-NOTICES.txt).
- Updated en_US spelling list from [English Speller Database (ESDB)](https://github.com/en-wl/wordlist-diff) (formerly SCOWL), under the licenses described in the upstream [Copyright](https://github.com/en-wl/wordlist-diff/blob/diff/Copyright).
- English entries from [Simple English Wiktionary](https://simple.wiktionary.org/) via [Kaikki/Wiktextract](https://kaikki.org/simplewiktionary/rawdata.html), under Wiktionary's CC BY-SA and GFDL terms (see [copyright](https://simple.wiktionary.org/wiki/Wiktionary:Copyrights)).
- English main-namespace article title components from [Wikimedia daily title dumps](https://dumps.wikimedia.org/other/pagetitles/), for current proper nouns and organizations. See [Wikimedia reuse terms](https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use).
- [src/data/dictionary-sources.json](src/data/dictionary-sources.json) records exact source revisions, URLs, and SHA-256 checksums. [src/data/dictionary-build.json](src/data/dictionary-build.json) records extracted word counts. Entries are spelling candidates only, not endorsements or editorial claims.

The word-list attribution and relevant permission notices must be retained if redistributing the corpus.

## Reproducible dictionary updates

`src/data/modern-lexicon.txt` is **generated**. Do not edit or manually add individual current-event names there. The source inputs and extraction rules are tracked in `src/data/dictionary-sources.json` and `scripts/build_dictionary.py`.

- `python3 scripts/build_dictionary.py --check`: download the exact locked source versions, verify their SHA-256 digests, and assert that the checked-in output matches (network access needed only for development/CI).
- `python3 scripts/build_dictionary.py --refresh`: intentionally resolve current upstream ESDB, Wiktionary and Wikipedia snapshot versions, compute new digests, and regenerate the offline wordlist and report.
- `python3 -m unittest discover -s scripts -p 'test_dictionary_builder.py'`: run unit tests with local source fixtures.
- The `Refresh offline dictionaries` GitHub Action refreshes monthly and opens a review PR with the source and wordlist diff. Merging is manual. If the repository disallows Actions-generated pull requests, enable that option in GitHub Actions settings.

The plugin itself makes **no dictionary network requests**. Its release contains the generated supplement and can check text fully offline. Wikipedia article titles are not independently verified given names or spelling judgments. Frequent article-title tokens and surnames corroborated by multiple biographies are preferred for suggestions. Up to 120,000 additional single-word article titles, prioritized toward acronyms, internally capitalized names and short terms, are included as low-confidence recognition-only vocabulary. Modern names in articles with relevant disambiguation qualifiers (such as technology or social networks) are included separately. These cannot dominate candidate ranking. That broadens modern name coverage but may also accept some unusual or erroneous title spellings. This is a best-effort supplement, not guaranteed coverage of every name or word; the personal dictionary remains available.

## Development

Run **npm ci && npm test && npm run build && npm run lint**. The test suite includes difficult spellings from long academic prose, Markdown masking, and stable correction offsets. For live coding, **npm run dev** watches changes. No remote service is required to develop or test the offline checker.

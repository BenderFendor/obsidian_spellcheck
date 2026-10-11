# Context Spellcheck for Obsidian

An offline-first spelling checker for long-form Markdown notes. It proposes corrections without changing your prose automatically. Designed to recognize specialist terms such as Marxism, psychoanalysis, bourgeoisie, and materialism.

## Features

- About 62,000 bundled words from a frequency list and the en_US SCOWL/Hunspell dictionary. No network or model download is needed for basic spelling.
- SymSpell-style symmetric delete index (edit distance 2) for fast common typos, followed by an n-gram/Damerau-Levenshtein fallback for harder misspellings.
- Contextual reranking using surrounding prose and a small academic/philosophy vocabulary. This is heuristic context scoring, not a neural language model.
- Up to ten ranked replacements for an unknown word, plus a personal dictionary.
- Wavy underlines in Obsidian's editor and commands for suggestions at the cursor or review of the selected text/entire note.
- A review modal that shows each candidate and lets you apply it individually. No automatic or bulk rewriting.
- Conservative offline grammar checks for repeated words, spacing, selected confusions, and double negatives.
- Optional LanguageTool grammar checks for richer sentence-level context. Disabled by default. Sends text ONLY when you enable the setting and click Run grammar check.

## Install (developer build)

Requires Node.js 18+ and npm.

1. Clone the repository and run **npm ci**, **npm test**, then **npm run build**.
2. Copy the files **main.js**, **manifest.json**, and **styles.css** into your vault folder **.obsidian/plugins/obsidian-spellcheck/**.
3. Reload Obsidian, enable **Context Spellcheck** in **Settings > Community plugins**.
4. Run **Review spelling and grammar in selection or note** from the command palette. Select a passage beforehand to limit review to that passage. Use **Show spelling suggestions at cursor** for ten alternatives.

This repository started from the Obsidian starter plugin and is not yet distributed through the community-plugin catalog.

## Optional contextual grammar

LanguageTool can be self-hosted. Start an instance serving its standard HTTP **/v2/check** endpoint, normally **http://127.0.0.1:8081/v2/check**, or supply another URL you trust. In plugin settings, enable **Allow LanguageTool checks**. Inside the review dialog, click **Run grammar check**. You can apply or ignore each returned suggestion. No background requests or analytics run.

For a remote endpoint, the reviewed note text or selection will leave your machine when you click the button. Do not configure a third-party service for private notes unless you accept that disclosure. LanguageTool corrections are proposals and should be evaluated for accuracy, especially around names, citations, quotations, and specialized terms.

## Accuracy and limitations

The corpus includes frequent English vocabulary and a SCOWL word list, plus a small specialist vocabulary. It is not exhaustive. The offline word recognizer uses conservative morphology heuristics and may propose false positives/negatives. It does not understand philosophical arguments, grammar as comprehensively as LanguageTool, or nuanced semantic mistakes such as a plausible but contextually wrong word. Context-based candidate ranking does not make a neural semantic model.

The plugin masks common Markdown syntax including YAML frontmatter, fenced and inline code, wikilinks, URLs, Markdown links, and tags. Some exotic embedded syntaxes may still be scanned. Corrections are applied by checked text offsets, and review stops if the note has changed externally to avoid editing the wrong range.

For large notes, selecting a paragraph or section before review reduces latency. The dictionary and spelling index operate locally, with candidate indexes constructed on demand.

## License and dictionary sources

Application code: [0BSD](LICENSE). The bundled word list combines:

- TextBlob English spelling frequencies, from [TextBlob](https://github.com/sloria/TextBlob/blob/dev/src/textblob/en/en-spelling.txt); see [TextBlob license](docs/TEXTBLOB-LICENSE.txt). Its source states the counts derive from Project Gutenberg, Wiktionary, the British National Corpus and Peter Norvig's corpus.
- English en_US Hunspell word stems derived from SCOWL, by Kevin Atkinson, from [LibreOffice dictionaries](https://github.com/LibreOffice/dictionaries/tree/master/en); see [SCOWL copyright and notices](docs/SCOWL-NOTICES.txt).

The word-list attribution and relevant permission notices must be retained if redistributing the corpus.

## Development

Run **npm ci && npm test && npm run build**. The test suite includes difficult spellings from long academic prose, Markdown masking, and stable correction offsets. For live coding, **npm run dev** watches changes. No remote service is required to develop or test the offline checker.

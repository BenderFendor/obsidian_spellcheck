import { unified } from 'unified';
import retextEnglish from 'retext-english';
import retextStringify from 'retext-stringify';
import retextIndefiniteArticle from 'retext-indefinite-article';
import retextRepeatedWords from 'retext-repeated-words';
import retextRedundantAcronyms from 'retext-redundant-acronyms';
import retextPassive from 'retext-passive';
import { proseOnly, type Correction } from './spelling';

/** Explicitly enabled rule groups. Style advice is opt-in. */
export interface OfflineGrammarRules {
  articles: boolean;
  repeatedWords: boolean;
  redundantAcronyms: boolean;
  passiveVoice: boolean;
}

export const DEFAULT_GRAMMAR_RULES: OfflineGrammarRules = {
  articles: true,
  repeatedWords: true,
  redundantAcronyms: true,
  passiveVoice: false,
};

/**
 * ReText/unified grammar diagnostics, fully bundled for offline use.
 * Checks a Markdown-masked copy so every replacement retains the original
 * UTF-16 offsets, without sending any note text to a server.
 */
export function offlineGrammarCheck(
  text: string,
  rules: OfflineGrammarRules = DEFAULT_GRAMMAR_RULES,
  limit = 250,
): Correction[] {
  if (!Object.values(rules).some(Boolean) || !text.trim()) return [];
  const prose = proseOnly(text);
  const processor = unified().use(retextEnglish).use(retextStringify);
  // The unified Processor is mutable before processSync. Avoid reassigning it:
  // different plugins specialize the generic parser/transformer type.
  if (rules.articles) processor.use(retextIndefiniteArticle);
  if (rules.repeatedWords) processor.use(retextRepeatedWords);
  if (rules.redundantAcronyms) processor.use(retextRedundantAcronyms);
  if (rules.passiveVoice) processor.use(retextPassive);
  // The serializer completes the processSync pipeline; nothing is rewritten.
  const file = processor.processSync(prose);
  const issues: Correction[] = [];
  for (const message of file.messages) {
    const place = message.place;
    if (!place || !('start' in place) || !('end' in place)) continue;
    const from = place.start.offset;
    const to = place.end.offset;
    if (typeof from !== 'number' || typeof to !== 'number' ||
        !Number.isSafeInteger(from) || !Number.isSafeInteger(to) ||
        from < 0 || from >= to || to > text.length) continue;
    const original = text.slice(from, to);
    // A diagnosis pointing into masked Markdown must never rewrite markup.
    if (original !== prose.slice(from, to)) continue;
    const suggestions = (message.expected || [])
      .filter((item): item is string => typeof item === 'string')
      .filter(item => item !== original)
      .slice(0, 10);
    // Passive voice has no safe automatic correction; still show an advisory.
    const messageText = message.reason || 'Grammar suggestion';
    if (issues.some(other => from < other.to && to > other.from)) continue;
    issues.push({
      from, to, original,
      suggestions,
      message: messageText + ' (' + (message.source || 'retext') + ')',
      source: 'grammar',
    });
    if (issues.length >= limit) break;
  }
  return issues.sort((a, b) => a.from - b.from);
}

/** Only inspect the local prose paragraph under a context click. */
export function grammarIssueAt(
  text: string, offset: number, rules: OfflineGrammarRules = DEFAULT_GRAMMAR_RULES,
): Correction | undefined {
  if (offset < 0 || offset > text.length) return undefined;
  const prose = proseOnly(text);
  // Make the request size independent of the document size.
  const from = Math.max(0, prose.lastIndexOf('\n', Math.max(0, offset - 1)) + 1);
  const nextNewline = prose.indexOf('\n', offset);
  const to = Math.min(prose.length, nextNewline < 0 ? prose.length : nextNewline);
  const end = Math.min(to, from + 16000);
  if (offset > end) return undefined;
  const portion = text.slice(from, end);
  const issues = offlineGrammarCheck(portion, rules);
  const issue = issues.find(item => from + item.from <= offset && offset <= from + item.to);
  return issue && {
    ...issue,
    from: from + issue.from,
    to: from + issue.to,
    original: text.slice(from + issue.from, from + issue.to),
  };
}

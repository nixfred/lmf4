#!/usr/bin/env bun
/**
 * AssociativeRecall.hook.ts — Automatic memory recall on every user message
 *
 * THE MISSING PIECE: Searches memory.db for context relevant to what the
 * user is currently talking about and injects it as a system-reminder.
 *
 * Trigger: UserPromptSubmit
 * Input: { content: string } — the user's message
 * Output: stdout system-reminder with relevant past context (or empty)
 *
 * Performance budget: <300ms total. Uses FTS5 only (no embedding at query time).
 * Token budget: <2000 chars injected per message.
 */

import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(process.env.HOME!, ".claude", "memory.db");
const MIN_QUERY_LENGTH = 12; // Skip very short messages like "yes", "ok", "do it"
const MAX_RESULTS = 5;
const MAX_OUTPUT_CHARS = 1800;
// Noise floor: suppress recall results scoring below this. Tuned from live
// diagnostic data — clearly-garbage matches cluster at 0.15–1.8; useful
// matches at 2.5+. Showing weak matches adds cognitive tax and can mislead,
// so silence is better than noise. Raise for stricter recall, lower for
// broader; 2.0 is the conservative default.
const MIN_SCORE = 2.0;

// Words that are too common to search for
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "don", "now", "also", "that", "this", "what", "which", "who", "whom",
  "these", "those", "i", "me", "my", "we", "our", "you", "your", "he",
  "him", "his", "she", "her", "it", "its", "they", "them", "their",
  "and", "but", "or", "if", "because", "while", "although", "about",
  "make", "like", "get", "go", "know", "take", "see", "come", "think",
  "look", "want", "give", "use", "find", "tell", "ask", "work", "seem",
  "feel", "try", "leave", "call", "keep", "let", "begin", "show", "hear",
  "play", "run", "move", "live", "believe", "bring", "happen", "write",
  "provide", "sit", "stand", "lose", "pay", "meet", "include", "continue",
  "set", "learn", "change", "lead", "understand", "watch", "follow",
  "stop", "create", "speak", "read", "allow", "add", "spend", "grow",
  "open", "walk", "win", "offer", "remember", "love", "consider", "appear",
  "buy", "wait", "serve", "die", "send", "expect", "build", "stay",
  "fall", "cut", "reach", "kill", "remain", "please", "help", "thanks",
  "yeah", "yes", "yep", "nope", "sure", "okay", "right", "well",
  "gonna", "wanna", "gotta", "lets", "let's", "don't", "doesn't",
  "didn't", "won't", "can't", "couldn't", "shouldn't", "wouldn't",
  "check", "fix", "look", "update", "something", "anything", "everything",
  "nothing", "thing", "things", "stuff", "way", "time", "good", "bad",
  "new", "old", "first", "last", "long", "great", "little", "much",
  "still", "even", "back", "kind", "really", "actually", "basically",
]);

interface UserPromptInput {
  content?: string;
  session_id?: string;
}

interface RecallResult {
  type: string;
  text: string;
  date: string;
  score: number;
}

function extractKeyTerms(text: string): string[] {
  // Remove markdown, URLs, code blocks, paths
  const cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\w\s-]/g, " ")
    .toLowerCase();

  const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
  const terms = words.filter((w) => !STOP_WORDS.has(w));

  // Deduplicate and take top terms (longer words are more likely to be specific)
  const unique = [...new Set(terms)];
  unique.sort((a, b) => b.length - a.length);

  return unique.slice(0, 6);
}

function buildFtsQuery(terms: string[]): string {
  // OR-join terms for broader matching, quote multi-word terms
  return terms.map((t) => `"${t}"`).join(" OR ");
}

function searchMemory(terms: string[]): RecallResult[] {
  if (terms.length === 0) return [];

  const db = new Database(DB_PATH, { readonly: true });
  const results: RecallResult[] = [];
  const ftsQuery = buildFtsQuery(terms);
  const now = Date.now();

  // Search decisions (highest value — direct actionable context)
  try {
    const rows = db
      .prepare(
        `SELECT d.decision, d.reasoning, d.created_at, rank
         FROM decisions_fts
         JOIN decisions d ON decisions_fts.rowid = d.id
         WHERE decisions_fts MATCH ? AND d.status = 'active'
         ORDER BY rank
         LIMIT 8`
      )
      .all(ftsQuery) as any[];

    for (const r of rows) {
      const age = (now - new Date(r.created_at).getTime()) / 86400000;
      const decay = Math.pow(0.97, age); // ~50% at 23 days
      results.push({
        type: "decision",
        text: r.reasoning ? `${r.decision} — ${r.reasoning}` : r.decision,
        date: r.created_at?.slice(0, 10) || "",
        score: Math.abs(r.rank) * decay * 1.0,
      });
    }
  } catch {}

  // Search errors (high value — prevents repeating mistakes)
  try {
    const rows = db
      .prepare(
        `SELECT e.error, e.fix, e.created_at, rank
         FROM errors_fts
         JOIN errors e ON errors_fts.rowid = e.id
         WHERE errors_fts MATCH ?
         ORDER BY rank
         LIMIT 5`
      )
      .all(ftsQuery) as any[];

    for (const r of rows) {
      if (!r.fix) continue;
      const age = (now - new Date(r.created_at).getTime()) / 86400000;
      const decay = Math.pow(0.97, age);
      results.push({
        type: "error/fix",
        text: `${r.error} → ${r.fix}`,
        date: r.created_at?.slice(0, 10) || "",
        score: Math.abs(r.rank) * decay * 0.9,
      });
    }
  } catch {}

  // Search session summaries (context — what did we work on?)
  try {
    const rows = db
      .prepare(
        `SELECT l.title, snippet(loa_fts, 1, '', '', '...', 30) as excerpt, l.created_at, rank
         FROM loa_fts
         JOIN loa_entries l ON loa_fts.rowid = l.id
         WHERE loa_fts MATCH ?
         ORDER BY rank
         LIMIT 5`
      )
      .all(ftsQuery) as any[];

    for (const r of rows) {
      const age = (now - new Date(r.created_at).getTime()) / 86400000;
      const decay = Math.pow(0.97, age);
      results.push({
        type: "past session",
        text: r.title,
        date: r.created_at?.slice(0, 10) || "",
        score: Math.abs(r.rank) * decay * 0.7,
      });
    }
  } catch {}

  // Search learnings
  try {
    const rows = db
      .prepare(
        `SELECT l.problem, l.solution, l.created_at, rank
         FROM learnings_fts
         JOIN learnings l ON learnings_fts.rowid = l.id
         WHERE learnings_fts MATCH ?
         ORDER BY rank
         LIMIT 5`
      )
      .all(ftsQuery) as any[];

    for (const r of rows) {
      if (!r.solution) continue;
      const age = (now - new Date(r.created_at).getTime()) / 86400000;
      const decay = Math.pow(0.97, age);
      results.push({
        type: "learning",
        text: `${r.problem} → ${r.solution}`,
        date: r.created_at?.slice(0, 10) || "",
        score: Math.abs(r.rank) * decay * 0.8,
      });
    }
  } catch {}

  db.close();

  // Sort by score descending, apply noise floor, take top N
  results.sort((a, b) => b.score - a.score);
  return results.filter((r) => r.score >= MIN_SCORE).slice(0, MAX_RESULTS);
}

function formatResults(results: RecallResult[]): string {
  if (results.length === 0) return "";

  const lines: string[] = ["[MEMORY CONTEXT — auto-recalled from past sessions]"];

  let chars = lines[0].length;
  for (const r of results) {
    const line = `• [${r.type}] (${r.date}) ${r.text}`;
    const truncated = line.length > 300 ? line.slice(0, 297) + "..." : line;
    if (chars + truncated.length + 1 > MAX_OUTPUT_CHARS) break;
    lines.push(truncated);
    chars += truncated.length + 1;
  }

  return lines.join("\n");
}

async function main() {
  let input: UserPromptInput = {};
  try {
    const raw = await Bun.stdin.text();
    input = JSON.parse(raw);
  } catch {
    return; // No input — skip
  }

  const content = input.content || "";

  // Skip short messages (greetings, confirmations, ratings)
  if (content.length < MIN_QUERY_LENGTH) return;

  // Skip if it looks like a rating or simple acknowledgment
  if (/^\d{1,2}$/.test(content.trim())) return;
  // Widened to cover more short-form acks and short-signal directives —
  // recall on "do your X" / "run it" / "try that" is essentially searching
  // on ~no signal and reliably returns noise. Silence beats noise here.
  if (/^(yes|yep|yeah|no|nope|ok|okay|sure|thanks|thx|do it|do your|go|run it|try (it|that)|fix it|make it|apply|continue|proceed|right|correct|agreed?|ship it|lgtm|good|great|perfect)\b/i.test(content.trim())) return;

  const terms = extractKeyTerms(content);
  if (terms.length === 0) return;

  const results = searchMemory(terms);
  if (results.length === 0) return;

  const formatted = formatResults(results);
  if (!formatted) return;

  // Output as system-reminder for context injection
  console.log(`<system-reminder>\n${formatted}\n</system-reminder>`);
}

main().catch(() => process.exit(0)); // Fail silently — never block the user

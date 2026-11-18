// Turning a piece of text into a vector.
//
// WHY EMBEDDINGS
// --------------
// The platform already compares a candidate's skills with the skills a posting
// names, and it does that comparison exactly. Exact comparison is precise and
// blind at the same time: "Postgres" and "PostgreSQL" are the same thing to
// a candidate and two different strings to a matcher, and a posting that asks
// for "React Native" is not a match for a candidate who writes "React" even
// when the work is nearly the same.
//
// An embedding model reads both texts and places them in the same space, so
// that texts which mean the same thing land close together. The distance
// between two vectors is then a usable measure of how alike they are.
//
// WHERE THE VECTORS LIVE
// ----------------------
// In the database, next to the data they describe, behind the platform's own
// row level security. Not in a vector database, not in a service: the
// extension was already available in the project's Postgres, so this adds no
// dependency and no deployment.
//
// THE MODEL
// ---------
// Google Gemini's `text-embedding-004`, which returns 768 dimensions — the
// width the `vector(768)` columns are declared with. The model name is
// recorded with every vector, so a model change invalidates the old vectors
// rather than mixing two kinds of vector together.
//
// THE KEY
// -------
// `GEMINI_API_KEY` is read on the server and never reaches the browser. The
// browser asks the platform's own API, which embeds on its behalf.

import { GoogleGenAI } from '@google/genai/web';

/** The model that produces the vectors. Recorded with every vector. */
export const EMBEDDING_MODEL = 'text-embedding-004';

/** How many dimensions the model returns. */
export const EMBEDDING_DIMENSIONS = 768;

/** The longest text that is embedded. */
const MAX_EMBEDDING_CHARS = 8_000;

/** How long one embedding request may take. */
const EMBEDDING_TIMEOUT_MS = 30_000;

/** True when the server can produce embeddings. */
export function isEmbeddingConfigured(): boolean {
  return Boolean((process.env.GEMINI_API_KEY ?? '').trim());
}

/**
 * The text of a posting that the vector is built from.
 *
 * The title comes first because it carries the most weight about what the
 * role is, then the company, then the description. A posting with no
 * description still gets a vector, because the title and the company say
 * something about it.
 */
export function jobEmbeddingText(job: {
  title: string;
  company: string;
  description?: string | null;
  location?: string | null;
  employmentType?: string | null;
}): string {
  const parts = [
    `Role: ${job.title}`,
    `Company: ${job.company}`,
    job.location ? `Location: ${job.location}` : null,
    job.employmentType ? `Type: ${job.employmentType}` : null,
    job.description ? `Description: ${job.description}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join('\n').slice(0, MAX_EMBEDDING_CHARS);
}

/**
 * The text of a candidate's record that the vector is built from.
 *
 * The skills come first because they are what the matching compares. The
 * target role and the experience level come next, because they say what kind
 * of work the candidate is looking for.
 */
export function profileEmbeddingText(profile: {
  headline?: string | null;
  skillNames?: readonly string[];
  targetRoleTitles?: readonly string[];
  experienceLevel?: string | null;
  educationLevel?: string | null;
  location?: string | null;
}): string {
  const parts = [
    profile.headline ? `Headline: ${profile.headline}` : null,
    profile.skillNames?.length ? `Skills: ${profile.skillNames.join(', ')}` : null,
    profile.targetRoleTitles?.length ? `Target roles: ${profile.targetRoleTitles.join(', ')}` : null,
    profile.experienceLevel ? `Experience level: ${profile.experienceLevel}` : null,
    profile.educationLevel ? `Education: ${profile.educationLevel}` : null,
    profile.location ? `Location: ${profile.location}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.join('\n').slice(0, MAX_EMBEDDING_CHARS);
}

/**
 * Embeds one piece of text.
 *
 * Returns `null` when the text is empty, when the server has no key, or when
 * the provider refuses. A missing vector is a missing signal, never a
 * failure of the whole search: the weighted matching carries on without it.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) return null;

  const content = text.trim();
  if (!content) return null;

  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
      timeout: EMBEDDING_TIMEOUT_MS,
    },
  });

  try {
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: content,
    });
    const values = response.embeddings?.[0]?.values;
    if (!values || values.length !== EMBEDDING_DIMENSIONS) return null;
    return values;
  } catch (error) {
    console.error('Embedding request failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Embeds several pieces of text in one request.
 *
 * The provider accepts a batch, and one request is cheaper and faster than
 * several. A batch that fails returns no vectors rather than some of them,
 * because a half-embedded set would compare vectors built by different calls.
 */
export async function embedTexts(texts: readonly string[]): Promise<number[][]> {
  const apiKey = (process.env.GEMINI_API_KEY ?? '').trim();
  if (!apiKey) return [];

  const contents = texts.map((text) => text.trim()).filter(Boolean);
  if (!contents.length) return [];

  const client = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
      timeout: EMBEDDING_TIMEOUT_MS,
    },
  });

  try {
    const response = await client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents,
    });
    const embeddings = response.embeddings ?? [];
    const vectors: number[][] = [];
    for (const entry of embeddings) {
      const values = entry.values;
      if (values && values.length === EMBEDDING_DIMENSIONS) {
        vectors.push(values);
      }
    }
    return vectors;
  } catch (error) {
    console.error('Embedding request failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Formats a vector the way Postgres reads it.
 *
 * pgvector accepts the array literal `'[0.1,0.2]'`, and a parameter binding
 * keeps the value out of the SQL text entirely, so nothing a user typed can
 * change the statement.
 */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.map((value) => Number(value).toFixed(6)).join(',')}]`;
}

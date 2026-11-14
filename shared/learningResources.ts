/**
 * Learning resource vocabulary.
 *
 * The Learning Hub is video-first. The database still stores the original
 * `format` (course, playlist, tutorial, ...), but a learner needs a clearer
 * resource type: is this a video course, a playlist, a course, an article, a
 * PDF, a book, a workshop or a lecture?
 *
 * The type is derived from the stored format, the provider and the URL so the
 * existing 500+ catalogue rows are classified without being rewritten. An
 * explicit `resource_type` column, when present, wins.
 */

export const RESOURCE_TYPES = [
  'video_course',
  'video_playlist',
  'course',
  'article',
  'documentation',
  'pdf',
  'book',
  'workshop',
  'lecture',
] as const;

export type LearningResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_TYPE_LABELS: Record<LearningResourceType, string> = {
  video_course: 'Video Course',
  video_playlist: 'Video Playlist',
  course: 'Course',
  article: 'Article',
  documentation: 'Documentation',
  pdf: 'PDF',
  book: 'Book',
  workshop: 'Workshop',
  lecture: 'Lecture',
};

export const VIDEO_RESOURCE_TYPES: readonly LearningResourceType[] = [
  'video_course',
  'video_playlist',
  'workshop',
  'lecture',
];

export function isLearningResourceType(value: string): value is LearningResourceType {
  return (RESOURCE_TYPES as readonly string[]).includes(value);
}

/** Extracts a YouTube video id from a watch, youtu.be or embed URL. */
export function youtubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = parsed.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{6,}$/.test(v)) return v;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' && parts[1] && /^[A-Za-z0-9_-]{6,}$/.test(parts[1])) {
        return parts[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Whether a URL points at a YouTube playlist rather than one video. */
export function isYoutubePlaylist(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (!/youtube\.com$/i.test(parsed.hostname.replace(/^www\./, '')) && parsed.hostname !== 'youtu.be') {
      return false;
    }
    return parsed.pathname === '/playlist' && Boolean(parsed.searchParams.get('list'));
  } catch {
    return false;
  }
}

/**
 * The best thumbnail available without inventing one:
 *   - an explicit thumbnail wins;
 *   - a YouTube video has a real, provider-hosted thumbnail;
 *   - otherwise null, and the card draws its clean branded category panel.
 *
 * A playlist has no public thumbnail endpoint, so it intentionally falls back
 * to the category panel. No provider logo is fabricated.
 */
export function officialThumbnail(
  url: string | null | undefined,
  explicit: string | null | undefined
): string | null {
  if (explicit && explicit.trim()) return explicit.trim();
  const id = youtubeVideoId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Classifies a row when the database has no explicit type. */
export function deriveResourceType(input: {
  format?: string | null;
  provider?: string | null;
  url?: string | null;
  title?: string | null;
}): LearningResourceType {
  const provider = (input.provider ?? '').toLowerCase();
  const url = (input.url ?? '').toLowerCase();
  const title = (input.title ?? '').toLowerCase();
  const format = (input.format ?? '').toLowerCase();

  // An official professional certificate programme is a course that hands
  // over a certificate — not a playlist of lessons, even when the
  // provider's own link happens to point at one. Calling the Google Data
  // Analytics Certificate a "YouTube Playlist" told the learner the wrong
  // thing about what they were signing up for.
  if (format === 'professional_certificate') return 'course';

  if (isYoutubePlaylist(input.url)) return 'video_playlist';
  if (youtubeVideoId(input.url)) {
    return format === 'playlist' ? 'video_playlist' : 'video_course';
  }
  if (format === 'playlist') return 'video_playlist';
  if (format === 'video') return 'video_course';

  if (provider.includes('documentation') || provider.includes('docs') || url.includes('/docs')) {
    return 'documentation';
  }
  if (url.endsWith('.pdf') || title.endsWith('.pdf') || title.includes('(pdf)')) return 'pdf';
  if (provider.includes('press') || format === 'tutorial') {
    // Tutorials on these sources are usually documentation pages.
    if (url.includes('/docs/') || provider.includes('documentation')) return 'documentation';
  }
  if (format === 'course' || format === 'professional_certificate' || format === 'learning_path') {
    return 'course';
  }
  if (format === 'tutorial') return 'article';
  return 'course';
}

/** The CTA that tells the learner what opening the resource will do. */
export function resourceCta(type: LearningResourceType): string {
  switch (type) {
    case 'video_course':
      return 'Watch Course';
    case 'video_playlist':
      return 'Open Playlist';
    case 'workshop':
      return 'Open Workshop';
    case 'lecture':
      return 'Watch Lecture';
    case 'article':
      return 'Read Article';
    case 'documentation':
      return 'Read Documentation';
    case 'pdf':
      return 'Open PDF';
    case 'book':
      return 'Open Book';
    case 'course':
    default:
      return 'View Course';
  }
}

/** True for resources whose primary experience is video. */
export function isVideoResource(type: LearningResourceType): boolean {
  return VIDEO_RESOURCE_TYPES.includes(type);
}

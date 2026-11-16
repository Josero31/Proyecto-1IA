import type { AgentAction, MovieCard } from './types';

const POSTER_PREFIX = 'https://image.tmdb.org/t/p/';
const IMDB_PREFIX = 'https://www.imdb.com/';
const TMDB_PREFIX = 'https://www.themoviedb.org/';
const OPEN_URL_HOSTS = { imdb: 'www.imdb.com', google_books: 'books.google.com' } as const;

export const MAX_CARDS_PER_MESSAGE = 3;

type Raw = Record<string, unknown>;

const isRecord = (value: unknown): value is Raw =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const allowedUrl = (value: unknown, prefix: string): string | null =>
  typeof value === 'string' && value.startsWith(prefix) ? value : null;

const finiteNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Devuelve `null` si la tarjeta es inválida; los enlaces o el póster no permitidos se descartan. */
export function parseMovieCard(raw: unknown): MovieCard | null {
  if (!isRecord(raw)) return null;
  const { tmdbId, title } = raw;
  if (typeof tmdbId !== 'number' || !Number.isInteger(tmdbId)) return null;
  if (typeof title !== 'string' || title.trim() === '') return null;

  return {
    tmdbId,
    title,
    year: finiteNumberOrNull(raw.year),
    posterUrl: allowedUrl(raw.posterUrl, POSTER_PREFIX),
    overview: typeof raw.overview === 'string' ? raw.overview : '',
    rating: finiteNumberOrNull(raw.rating),
    imdbUrl: allowedUrl(raw.imdbUrl, IMDB_PREFIX),
    tmdbUrl: allowedUrl(raw.tmdbUrl, TMDB_PREFIX),
  };
}

/** Solo https y el host del sitio declarado. */
export function parseOpenUrl(raw: Raw): AgentAction | null {
  const { url, site } = raw;
  if (typeof url !== 'string' || (site !== 'imdb' && site !== 'google_books')) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== OPEN_URL_HOSTS[site]) return null;
  } catch {
    return null;
  }
  return { type: 'open_url', url, site };
}

import type { MovieCard } from '../../core/types';

function createLink(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function createText(tag: 'h3' | 'p', className: string, text: string): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

/** Se arma solo con `createElement` y `textContent`: los datos de la tarjeta nunca son HTML. */
export function createMovieCardElement(card: MovieCard): HTMLElement {
  const el = document.createElement('article');
  el.className = 'movie-card';
  el.dataset.tmdbId = String(card.tmdbId);

  if (card.posterUrl) {
    const poster = document.createElement('img');
    poster.className = 'movie-poster';
    poster.src = card.posterUrl;
    poster.alt = `Póster de ${card.title}`;
    poster.loading = 'lazy';
    poster.referrerPolicy = 'no-referrer';
    el.append(poster);
  }

  const info = document.createElement('div');
  info.className = 'movie-info';
  info.append(
    createText('h3', 'movie-title', card.year ? `${card.title} (${card.year})` : card.title),
  );
  if (card.rating !== null) {
    info.append(createText('p', 'movie-rating', `★ ${card.rating.toFixed(1)}/10`));
  }
  if (card.overview) {
    info.append(createText('p', 'movie-overview', card.overview));
  }

  const links = document.createElement('div');
  links.className = 'movie-links';
  if (card.imdbUrl) links.append(createLink(card.imdbUrl, 'Ver en IMDb'));
  if (card.tmdbUrl) links.append(createLink(card.tmdbUrl, 'Ver en TMDB'));
  if (links.childElementCount > 0) info.append(links);

  el.append(info);
  return el;
}

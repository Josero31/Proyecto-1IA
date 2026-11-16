import { describe, expect, it } from 'vitest';
import type { MovieCard } from '../../core/types';
import { createMovieCardElement } from './movie-card';

const card: MovieCard = {
  tmdbId: 438631,
  title: 'Dune',
  year: 2021,
  posterUrl: 'https://image.tmdb.org/t/p/w500/dune.jpg',
  overview: 'Paul Atreides llega a Arrakis.',
  rating: 7.84,
  imdbUrl: 'https://www.imdb.com/title/tt1160419/',
  tmdbUrl: 'https://www.themoviedb.org/movie/438631',
};

describe('createMovieCardElement', () => {
  it('muestra póster, título con año, calificación, sinopsis y enlaces', () => {
    const el = createMovieCardElement(card);
    expect(el.querySelector('.movie-title')?.textContent).toBe('Dune (2021)');
    expect(el.querySelector('.movie-rating')?.textContent).toBe('★ 7.8/10');
    expect(el.querySelector('.movie-overview')?.textContent).toBe('Paul Atreides llega a Arrakis.');
    const links = [...el.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(['Ver en IMDb', 'Ver en TMDB']);
  });

  it('el póster lleva alt, carga diferida y sin referrer', () => {
    const img = createMovieCardElement(card).querySelector('img') as HTMLImageElement;
    expect(img.src).toBe(card.posterUrl);
    expect(img.alt).toBe('Póster de Dune');
    expect(img.loading).toBe('lazy');
    expect(img.referrerPolicy).toBe('no-referrer');
  });

  it('los enlaces abren en otra pestaña con noopener noreferrer', () => {
    for (const link of createMovieCardElement(card).querySelectorAll('a')) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
    }
  });

  it('sin póster no muestra imagen, y omite lo que falta', () => {
    const el = createMovieCardElement({
      ...card,
      posterUrl: null,
      year: null,
      rating: null,
      overview: '',
      imdbUrl: null,
      tmdbUrl: null,
    });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.movie-title')?.textContent).toBe('Dune');
    expect(el.querySelector('.movie-rating')).toBeNull();
    expect(el.querySelector('.movie-overview')).toBeNull();
    expect(el.querySelector('.movie-links')).toBeNull();
  });

  it('trata los textos como texto, nunca como HTML', () => {
    const el = createMovieCardElement({
      ...card,
      title: '<img src=x onerror=alert(1)>',
      overview: '<script>alert(1)</script>',
    });
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelectorAll('img')).toHaveLength(1);
    expect(el.querySelector('.movie-title')?.textContent).toContain('<img src=x');
  });
});

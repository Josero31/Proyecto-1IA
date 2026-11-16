import { describe, expect, it } from 'vitest';
import { parseMovieCard, parseOpenUrl } from './validation';

const validCard = {
  tmdbId: 438631,
  title: 'Dune',
  year: 2021,
  posterUrl: 'https://image.tmdb.org/t/p/w500/dune.jpg',
  overview: 'Paul Atreides llega a Arrakis.',
  rating: 7.8,
  imdbUrl: 'https://www.imdb.com/title/tt1160419/',
  tmdbUrl: 'https://www.themoviedb.org/movie/438631',
};

describe('parseMovieCard', () => {
  it('acepta una tarjeta válida sin cambios', () => {
    expect(parseMovieCard(validCard)).toEqual(validCard);
  });

  it.each([
    ['otro dominio', 'https://evil.example/t/p/x.jpg'],
    ['http sin cifrar', 'http://image.tmdb.org/t/p/x.jpg'],
    ['subdominio engañoso', 'https://image.tmdb.org.evil.example/t/p/x.jpg'],
    ['data URI', 'data:image/png;base64,AAAA'],
  ])('descarta el póster de %s y conserva la tarjeta', (_name, posterUrl) => {
    expect(parseMovieCard({ ...validCard, posterUrl })?.posterUrl).toBeNull();
  });

  it('descarta enlaces a dominios no permitidos', () => {
    const card = parseMovieCard({
      ...validCard,
      imdbUrl: 'https://evil.example/title/tt1',
      tmdbUrl: 'javascript:alert(1)',
    });
    expect(card?.imdbUrl).toBeNull();
    expect(card?.tmdbUrl).toBeNull();
  });

  it('normaliza campos opcionales ausentes o de tipo incorrecto', () => {
    const card = parseMovieCard({ tmdbId: 1, title: 'X', year: 'dos', rating: NaN, overview: 3 });
    expect(card).toMatchObject({ year: null, rating: null, overview: '', posterUrl: null });
  });

  it.each([
    null,
    'texto',
    [],
    { title: 'Sin id' },
    { tmdbId: 1.5, title: 'X' },
    { tmdbId: 1 },
    { tmdbId: 1, title: '  ' },
  ])('rechaza una tarjeta inválida: %j', (raw) => {
    expect(parseMovieCard(raw)).toBeNull();
  });
});

describe('parseOpenUrl', () => {
  it('acepta IMDb y Google Books por https', () => {
    expect(parseOpenUrl({ url: 'https://www.imdb.com/title/tt1/', site: 'imdb' })).toEqual({
      type: 'open_url',
      url: 'https://www.imdb.com/title/tt1/',
      site: 'imdb',
    });
    expect(
      parseOpenUrl({ url: 'https://books.google.com/books?id=abc', site: 'google_books' }),
    ).not.toBeNull();
  });

  it.each([
    [{ url: 'http://www.imdb.com/title/tt1/', site: 'imdb' }],
    [{ url: 'https://evil.example/', site: 'imdb' }],
    [{ url: 'https://www.imdb.com.evil.example/', site: 'imdb' }],
    [{ url: 'https://www.imdb.com/', site: 'google_books' }],
    [{ url: 'https://www.imdb.com/', site: 'otro' }],
    [{ url: 'javascript:alert(1)', site: 'imdb' }],
    [{ url: 'no es una url', site: 'imdb' }],
    [{ url: 42, site: 'imdb' }],
  ])('rechaza %j', (raw) => {
    expect(parseOpenUrl(raw)).toBeNull();
  });
});

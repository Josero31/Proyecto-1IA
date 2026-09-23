import DOMPurify from 'dompurify';
import { Marked } from 'marked';

const markdown = new Marked({ gfm: true, breaks: true });

// Sin <img>, <iframe>, <style> ni formularios: un agente no debería poder cargar recursos
// externos (tracking pixels) ni inyectar estilos o controles en el sitio del cliente.
const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
];

const ALLOWED_ATTR = ['href', 'title', 'class', 'start', 'align'];

let purifier: ReturnType<typeof DOMPurify> | undefined;

// Instancia propia de DOMPurify para que el hook de enlaces no afecte a una copia de
// DOMPurify que el sitio del cliente pueda estar usando por su cuenta.
function getPurifier(): ReturnType<typeof DOMPurify> {
  if (!purifier) {
    purifier = DOMPurify(window);
    purifier.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer nofollow');
      }
    });
  }
  return purifier;
}

export function renderMarkdown(source: string): string {
  const html = markdown.parse(source, { async: false });
  return getPurifier().sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

import DOMPurify from 'dompurify';

// Configure DOMPurify to allow safe HTML tags
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 'b', 'i', 
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
  'ul', 'ol', 'li', 
  'span', 'div', 'a', 
  'blockquote', 'pre', 'code', 
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 
  'img', 'hr'
];

const ALLOWED_ATTR = [
  'class', 'href', 'target', 'rel', 
  'src', 'alt', 'width', 'height', 'style'
];

/**
 * Sanitize HTML content to prevent XSS attacks
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string safe for rendering
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return '';
  
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
}

/**
 * Check if a string contains HTML tags
 */
export function isHtml(str: string): boolean {
  return /<[^>]*>/.test(str);
}

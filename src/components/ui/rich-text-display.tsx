import { cn } from '@/lib/utils';
import { useEffect, useRef, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import DOMPurify from 'dompurify';

// Configure DOMPurify to allow safe HTML tags
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'b', 'i', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'span', 'div', 'a', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'hr'];
const ALLOWED_ATTR = ['class', 'href', 'target', 'rel', 'src', 'alt', 'width', 'height', 'style'];

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });
}

interface RichTextDisplayProps {
  content: string;
  className?: string;
}

export function RichTextDisplay({ content, className }: RichTextDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // If content is plain text (no HTML tags), wrap in paragraphs
  const isPlainText = !content?.includes('<');
  
  // Sanitize and format content
  const formattedContent = useMemo(() => {
    if (!content) return '';
    
    if (isPlainText) {
      return content.split('\n').filter(Boolean).map(p => `<p>${DOMPurify.sanitize(p)}</p>`).join('');
    }
    
    return sanitizeHtml(content);
  }, [content, isPlainText]);

  // Process LaTeX after render
  useEffect(() => {
    if (!containerRef.current || !formattedContent) return;
    
    // Process LaTeX delimiters: \( ... \), $...$, \[ ... \], $$...$$
    const processLatex = (element: HTMLElement) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
      const textNodes: Text[] = [];
      
      while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
      }
      
      textNodes.forEach((textNode) => {
        const text = textNode.textContent || '';
        
        // Check for LaTeX patterns
        const hasInlineBackslash = text.includes('\\(') && text.includes('\\)');
        const hasDisplayBackslash = text.includes('\\[') && text.includes('\\]');
        const hasInlineDollar = /(?<!\$)\$(?!\$)/.test(text);
        const hasDisplayDollar = text.includes('$$');
        
        if (!hasInlineBackslash && !hasDisplayBackslash && !hasInlineDollar && !hasDisplayDollar) return;
        
        const span = document.createElement('span');
        let html = text;
        
        // Process display math $$ ... $$ (must be before single $)
        html = html.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
          try {
            return `<span class="katex-display">${katex.renderToString(latex.trim(), { 
              displayMode: true, 
              throwOnError: false 
            })}</span>`;
          } catch {
            return `$$${latex}$$`;
          }
        });
        
        // Process display math \[ ... \]
        html = html.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => {
          try {
            return `<span class="katex-display">${katex.renderToString(latex.trim(), { 
              displayMode: true, 
              throwOnError: false 
            })}</span>`;
          } catch {
            return `\\[${latex}\\]`;
          }
        });
        
        // Process inline math \( ... \)
        html = html.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => {
          try {
            return katex.renderToString(latex.trim(), { 
              displayMode: false, 
              throwOnError: false 
            });
          } catch {
            return `\\(${latex}\\)`;
          }
        });
        
        // Process inline math $ ... $ (single dollar signs, not preceded/followed by another $)
        html = html.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (_, latex) => {
          try {
            return katex.renderToString(latex.trim(), { 
              displayMode: false, 
              throwOnError: false 
            });
          } catch {
            return `$${latex}$`;
          }
        });
        
        span.innerHTML = html;
        textNode.parentNode?.replaceChild(span, textNode);
      });
    };
    
    processLatex(containerRef.current);
  }, [formattedContent]);

  return (
    <div 
      ref={containerRef}
      className={cn(
        'prose prose-sm max-w-none dark:prose-invert',
        '[&_p]:mb-2 [&_p:last-child]:mb-0',
        '[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2',
        '[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2',
        '[&_li]:mb-1',
        '[&_strong]:font-bold',
        '[&_em]:italic',
        '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2:first-child]:mt-0',
        '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3',
        '[&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto',
        className
      )}
      dangerouslySetInnerHTML={{ __html: formattedContent || '' }}
    />
  );
}

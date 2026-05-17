import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Undo,
  Redo,
  Link as LinkIcon,
  Subscript,
  Superscript,
  Pi
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState, useCallback } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
}

// Common math symbols
const mathSymbols = [
  { symbol: '±', label: 'Mais ou menos' },
  { symbol: '÷', label: 'Divisão' },
  { symbol: '×', label: 'Multiplicação' },
  { symbol: '√', label: 'Raiz quadrada' },
  { symbol: '∛', label: 'Raiz cúbica' },
  { symbol: '∞', label: 'Infinito' },
  { symbol: '≠', label: 'Diferente' },
  { symbol: '≈', label: 'Aproximadamente' },
  { symbol: '≤', label: 'Menor ou igual' },
  { symbol: '≥', label: 'Maior ou igual' },
  { symbol: '∑', label: 'Somatório' },
  { symbol: '∏', label: 'Produtório' },
  { symbol: '∫', label: 'Integral' },
  { symbol: 'π', label: 'Pi' },
  { symbol: 'α', label: 'Alfa' },
  { symbol: 'β', label: 'Beta' },
  { symbol: 'γ', label: 'Gama' },
  { symbol: 'δ', label: 'Delta' },
  { symbol: 'Δ', label: 'Delta maiúsculo' },
  { symbol: 'θ', label: 'Teta' },
  { symbol: 'λ', label: 'Lambda' },
  { symbol: 'μ', label: 'Mi' },
  { symbol: 'σ', label: 'Sigma' },
  { symbol: 'Σ', label: 'Sigma maiúsculo' },
  { symbol: 'φ', label: 'Fi' },
  { symbol: 'ω', label: 'Ômega' },
  { symbol: '∈', label: 'Pertence' },
  { symbol: '∉', label: 'Não pertence' },
  { symbol: '⊂', label: 'Subconjunto' },
  { symbol: '⊃', label: 'Superconjunto' },
  { symbol: '∪', label: 'União' },
  { symbol: '∩', label: 'Interseção' },
  { symbol: '∅', label: 'Conjunto vazio' },
  { symbol: '∀', label: 'Para todo' },
  { symbol: '∃', label: 'Existe' },
  { symbol: '¬', label: 'Negação' },
  { symbol: '∧', label: 'E lógico' },
  { symbol: '∨', label: 'Ou lógico' },
  { symbol: '→', label: 'Implica' },
  { symbol: '↔', label: 'Se e somente se' },
  { symbol: '°', label: 'Grau' },
  { symbol: '′', label: 'Linha (derivada)' },
  { symbol: '″', label: 'Duas linhas' },
  { symbol: 'ℕ', label: 'Naturais' },
  { symbol: 'ℤ', label: 'Inteiros' },
  { symbol: 'ℚ', label: 'Racionais' },
  { symbol: 'ℝ', label: 'Reais' },
  { symbol: 'ℂ', label: 'Complexos' },
];

// Common LaTeX equations
const latexTemplates = [
  { latex: '\\frac{a}{b}', label: 'Fração' },
  { latex: 'x^{2}', label: 'Expoente' },
  { latex: 'x_{i}', label: 'Índice' },
  { latex: '\\sqrt{x}', label: 'Raiz quadrada' },
  { latex: '\\sqrt[n]{x}', label: 'Raiz n-ésima' },
  { latex: '\\sum_{i=1}^{n}', label: 'Somatório' },
  { latex: '\\int_{a}^{b}', label: 'Integral definida' },
  { latex: '\\lim_{x \\to \\infty}', label: 'Limite' },
  { latex: '\\log_{a}(x)', label: 'Logaritmo' },
  { latex: '\\sin(x)', label: 'Seno' },
  { latex: '\\cos(x)', label: 'Cosseno' },
  { latex: '\\tan(x)', label: 'Tangente' },
];

export function MathRichTextEditor({
  value,
  onChange,
  placeholder = 'Digite aqui...',
  disabled = false,
  className,
  minHeight = '120px',
}: MathRichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);
  const [latexInput, setLatexInput] = useState('');
  const [latexPreview, setLatexPreview] = useState('');
  const [latexError, setLatexError] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          HTMLAttributes: {
            class: 'list-disc pl-4',
          },
        },
        orderedList: {
          HTMLAttributes: {
            class: 'list-decimal pl-4',
          },
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [disabled, editor]);

  // Render LaTeX preview
  useEffect(() => {
    if (latexInput) {
      try {
        const rendered = katex.renderToString(latexInput, {
          throwOnError: true,
          displayMode: false,
        });
        setLatexPreview(rendered);
        setLatexError('');
      } catch (e) {
        setLatexPreview('');
        setLatexError('Equação inválida');
      }
    } else {
      setLatexPreview('');
      setLatexError('');
    }
  }, [latexInput]);

  const insertSymbol = useCallback((symbol: string) => {
    editor?.chain().focus().insertContent(symbol).run();
  }, [editor]);

  const insertLatex = useCallback(() => {
    if (latexInput && !latexError) {
      try {
        const rendered = katex.renderToString(latexInput, {
          throwOnError: true,
          displayMode: false,
        });
        // Insert as HTML span with rendered equation
        editor?.chain().focus().insertContent(`<span class="katex-inline" data-latex="${latexInput}">${rendered}</span>`).run();
        setLatexInput('');
        setMathOpen(false);
      } catch (e) {
        // Don't insert if error
      }
    }
  }, [editor, latexInput, latexError]);

  const addLink = useCallback(() => {
    if (linkUrl) {
      let url = linkUrl;
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      setLinkUrl('');
      setLinkOpen(false);
    }
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    editor?.chain().focus().unsetLink().run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn('border rounded-md overflow-hidden', className)}>
      {/* Toolbar */}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              'h-8 w-8 p-0',
              editor.isActive('bold') && 'bg-muted'
            )}
            title="Negrito (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              'h-8 w-8 p-0',
              editor.isActive('italic') && 'bg-muted'
            )}
            title="Itálico (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              'h-8 w-8 p-0',
              editor.isActive('bulletList') && 'bg-muted'
            )}
            title="Lista com marcadores"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              'h-8 w-8 p-0',
              editor.isActive('orderedList') && 'bg-muted'
            )}
            title="Lista numerada"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          {/* Link Button */}
          <Popover open={linkOpen} onOpenChange={setLinkOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 w-8 p-0',
                  editor.isActive('link') && 'bg-muted'
                )}
                title="Inserir link"
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-2">
                <p className="text-sm font-medium">Inserir Link</p>
                <Input
                  placeholder="https://exemplo.com/imagem.jpg"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addLink()}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={addLink}>Inserir</Button>
                  {editor.isActive('link') && (
                    <Button size="sm" variant="outline" onClick={removeLink}>Remover</Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          {/* Math Symbols */}
          <Popover open={mathOpen} onOpenChange={setMathOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="Símbolos matemáticos e equações"
              >
                <Pi className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96" align="start">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-2">Símbolos Matemáticos</p>
                  <div className="grid grid-cols-10 gap-1 max-h-32 overflow-y-auto">
                    {mathSymbols.map((item) => (
                      <Button
                        key={item.symbol}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 text-lg"
                        title={item.label}
                        onClick={() => insertSymbol(item.symbol)}
                      >
                        {item.symbol}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-2">Equações LaTeX</p>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {latexTemplates.map((item) => (
                      <Button
                        key={item.latex}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        title={item.label}
                        onClick={() => setLatexInput(item.latex)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Input
                      placeholder="Digite LaTeX: \frac{a}{b}"
                      value={latexInput}
                      onChange={(e) => setLatexInput(e.target.value)}
                    />
                    {latexPreview && (
                      <div 
                        className="p-2 bg-muted rounded text-center"
                        dangerouslySetInnerHTML={{ __html: latexPreview }}
                      />
                    )}
                    {latexError && (
                      <p className="text-xs text-destructive">{latexError}</p>
                    )}
                    <Button 
                      size="sm" 
                      onClick={insertLatex}
                      disabled={!latexInput || !!latexError}
                    >
                      Inserir Equação
                    </Button>
                  </div>
                </div>
                
                <div className="border-t pt-3">
                  <p className="text-sm font-medium mb-2">Caracteres Especiais</p>
                  <div className="flex flex-wrap gap-1">
                    {['²', '³', '⁴', '⁵', '½', '⅓', '¼', '⅔', '¾', '‰'].map((char) => (
                      <Button
                        key={char}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 text-lg"
                        onClick={() => insertSymbol(char)}
                      >
                        {char}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          {/* Subscript/Superscript quick buttons */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Sobrescrito (x²)"
            onClick={() => insertSymbol('²')}
          >
            <Superscript className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title="Subscrito"
            onClick={() => insertSymbol('₂')}
          >
            <Subscript className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="h-8 w-8 p-0"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="h-8 w-8 p-0"
            title="Refazer (Ctrl+Y)"
          >
            <Redo className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* Editor Content */}
      <EditorContent 
        editor={editor} 
        className={cn(
          'prose prose-sm max-w-none p-3 focus-within:outline-none',
          '[&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          disabled && 'bg-muted/20'
        )}
        style={{ minHeight }}
      />
    </div>
  );
}

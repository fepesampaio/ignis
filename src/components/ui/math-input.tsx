import { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pi } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface MathInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const quickSymbols = [
  '±', '÷', '×', '√', '≠', '≈', '≤', '≥', 
  'π', 'α', 'β', 'δ', 'θ', '∞', '°',
  '²', '³', '⁴', '½', '¼', '¾',
  '∈', '∉', '⊂', '∪', '∩', '∅',
  '∑', '∫', '∏', 'Δ', 'σ', 'μ',
];

export function MathInput({ value, onChange, placeholder, className }: MathInputProps) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const insertSymbol = (symbol: string) => {
    const input = inputRef.current;
    if (input) {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue = value.slice(0, start) + symbol + value.slice(end);
      onChange(newValue);
      // Set cursor position after inserted symbol
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + symbol.length, start + symbol.length);
      }, 0);
    } else {
      onChange(value + symbol);
    }
  };

  return (
    <div className={cn('flex gap-1', className)}>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            title="Símbolos matemáticos"
          >
            <Pi className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="space-y-2">
            <p className="text-sm font-medium">Símbolos</p>
            <div className="grid grid-cols-8 gap-1">
              {quickSymbols.map((symbol) => (
                <Button
                  key={symbol}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 text-base"
                  onClick={() => insertSymbol(symbol)}
                >
                  {symbol}
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

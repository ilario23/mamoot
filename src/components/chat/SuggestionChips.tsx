// ============================================================
// SuggestionChips — Clickable follow-up suggestions from AI
// ============================================================
//
// Renders 2-3 animated pill buttons that the user can click to
// quickly continue the conversation. Styled in the app's
// neobrutalist design system.

'use client';

import {Sparkles} from 'lucide-react';

interface SuggestionChipsProps {
  /** Follow-up suggestions to display. */
  suggestions: string[];
  /** Called when the user clicks a suggestion. */
  onSelect: (text: string) => void;
}

const SuggestionChips = ({suggestions, onSelect}: SuggestionChipsProps) => {
  if (suggestions.length === 0) return null;

  const chipColors = [
    'bg-secondary/15 text-secondary border-secondary/40 hover:bg-secondary/25',
    'bg-primary/15 text-primary border-primary/40 hover:bg-primary/25',
    'bg-accent/30 text-accent-foreground border-accent/60 hover:bg-accent/50',
  ];

  return (
    <div className='flex flex-wrap gap-1.5 px-2 md:px-3 py-2 border-t md:border-t-2 border-border/50'>
      <Sparkles className='h-3 w-3 text-primary/60 shrink-0 mt-1' />
      {suggestions.map((suggestion, idx) => (
        <button
          key={suggestion}
          onClick={() => onSelect(suggestion)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(suggestion);
            }
          }}
          tabIndex={0}
          aria-label={`Ask: ${suggestion}`}
          className={`animate-fade-in-up px-2.5 py-1 text-[11px] font-black border-2 shadow-neo-sm hover:shadow-none transition-all cursor-pointer truncate max-w-[260px] ${chipColors[idx % chipColors.length]}`}
          style={{animationDelay: `${idx * 80}ms`}}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
};

export default SuggestionChips;

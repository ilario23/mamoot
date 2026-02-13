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
    'bg-secondary/15 text-secondary border-secondary/40 border-l-secondary',
    'bg-primary/15 text-primary border-primary/40 border-l-primary',
    'bg-accent/30 text-accent-foreground border-accent/60 border-l-accent',
  ];

  return (
    <div className='flex gap-2 px-0 md:px-0 py-1 overflow-x-auto scrollbar-hide md:flex-wrap md:overflow-x-visible'>
      <Sparkles className='h-3.5 w-3.5 text-primary/60 shrink-0 mt-1.5' />
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
          className={`animate-fade-in-up px-3 py-1.5 text-xs font-black border-2 border-l-[3px] shadow-neo-sm transition-all cursor-pointer shrink-0 md:shrink md:truncate md:max-w-[280px] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none active:translate-x-1 active:translate-y-1 ${chipColors[idx % chipColors.length]}`}
          style={{animationDelay: `${idx * 80}ms`}}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
};

export default SuggestionChips;

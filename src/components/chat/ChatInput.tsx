// ============================================================
// ChatInput — Textarea with @-mention pills and inline popup
// ============================================================
//
// Replaces the plain <input> in AITeamChat. Detects `@query`
// patterns while typing to open & filter the MentionPopup inline.
// Manages MentionReference[] state and renders removable pill tags.

'use client';

import {
  useState,
  useRef,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import {X, Send, Loader2, AtSign} from 'lucide-react';
import MentionPopup, {type MentionPopupHandle} from './MentionPopup';
import {getMentionCategory, type MentionReference} from '@/lib/mentionTypes';
import {useSidebarCollapse} from '@/contexts/SidebarContext';

interface ChatInputProps {
  /** Called when the user sends a message. */
  onSend: (text: string, mentions: MentionReference[]) => void;
  /** Whether the AI is currently streaming a response. */
  isStreaming: boolean;
  /** Placeholder text for the input. */
  placeholder?: string;
}

/** Detect @query at the cursor: returns {query, startIndex} or null. */
const detectMentionAtCursor = (
  value: string,
  cursorPos: number,
): {query: string; startIndex: number} | null => {
  // Walk backwards from cursor to find `@`
  let i = cursorPos - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === '@') {
      // `@` must be at start of input or preceded by whitespace
      if (i === 0 || /\s/.test(value[i - 1] ?? '')) {
        const query = value.slice(i + 1, cursorPos);
        // Only match if query has no spaces (single token)
        if (!/\s/.test(query)) {
          return {query, startIndex: i};
        }
      }
      return null;
    }
    // Stop walking if we hit whitespace (no `@` in this token)
    if (/\s/.test(ch ?? '')) return null;
    i--;
  }
  return null;
};

const ChatInput = ({onSend, isStreaming, placeholder}: ChatInputProps) => {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<MentionReference[]>([]);
  const [popupOpen, setPopupOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [mentionStart, setMentionStart] = useState(-1); // index of `@` in text
  const [triggeredByButton, setTriggeredByButton] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popupRef = useRef<MentionPopupHandle>(null);
  const {collapseSidebar} = useSidebarCollapse();

  const handleTextareaFocus = useCallback(() => {
    collapseSidebar();
  }, [collapseSidebar]);

  // ---- Inline @-detection on every text change ----
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setText(val);

      const cursorPos = e.target.selectionStart;
      const mention = detectMentionAtCursor(val, cursorPos);

      if (mention) {
        setFilterText(mention.query);
        setMentionStart(mention.startIndex);
        setPopupOpen(true);
        setTriggeredByButton(false);
      } else {
        // Close popup if we're in inline-detect mode (not button-triggered)
        if (!triggeredByButton) {
          setPopupOpen(false);
          setFilterText('');
          setMentionStart(-1);
        }
      }
    },
    [triggeredByButton],
  );

  const closePopup = useCallback(() => {
    setPopupOpen(false);
    setFilterText('');
    setMentionStart(-1);
    setTriggeredByButton(false);
  }, []);

  const handleSend = useCallback(() => {
    if (!text.trim() || isStreaming) return;
    onSend(text.trim(), mentions);
    setText('');
    setMentions([]);
    closePopup();
  }, [text, mentions, isStreaming, onSend, closePopup]);

  const handleMentionSelect = useCallback(
    (mention: MentionReference) => {
      // Avoid duplicates (same category + item)
      const exists = mentions.some(
        (m) =>
          m.categoryId === mention.categoryId && m.itemId === mention.itemId,
      );
      if (!exists) {
        setMentions((prev) => [...prev, mention]);
      }

      // If triggered inline, remove the `@query` text from the textarea
      if (mentionStart >= 0) {
        const before = text.slice(0, mentionStart);
        const afterCursor = text.slice(mentionStart + 1 + filterText.length);
        const newText = before + afterCursor;
        setText(newText);
      }

      closePopup();
      // Refocus the textarea
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [mentions, mentionStart, text, filterText, closePopup],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (popupOpen) {
        // Forward navigation keys to the popup
        if (
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
        ) {
          e.preventDefault();
          popupRef.current?.handleNavKey(e.key);
          return;
        }

        // Enter selects the highlighted item in the popup
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          popupRef.current?.handleNavKey('Enter');
          return;
        }

        // Tab also selects the highlighted item
        if (e.key === 'Tab') {
          e.preventDefault();
          popupRef.current?.handleNavKey('Enter');
          return;
        }

        // Close popup on Escape
        if (e.key === 'Escape') {
          e.preventDefault();
          closePopup();
          return;
        }
      }

      // Send on Enter (without Shift), but not when popup is open
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [popupOpen, handleSend, closePopup],
  );

  const handleRemoveMention = useCallback((index: number) => {
    setMentions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAtButtonClick = useCallback(() => {
    setTriggeredByButton(true);
    setFilterText('');
    setMentionStart(-1);
    setPopupOpen(true);
    // Don't refocus the textarea here — the MentionPopup will focus its own
    // search input. Focusing the textarea would move focus outside the Radix
    // Popover, causing it to immediately close via onOpenChange.
  }, []);

  return (
    <div className='relative p-3 border-t-3 border-border'>
      {/* Mention pills */}
      {mentions.length > 0 && (
        <div className='flex flex-wrap gap-1.5 mb-2'>
          {mentions.map((mention, idx) => {
            const cat = getMentionCategory(mention.categoryId);
            const Icon = cat?.icon;
            return (
              <span
                key={`${mention.categoryId}-${mention.itemId ?? 'all'}-${idx}`}
                className='inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-primary/10 border-2 border-primary/30 text-primary rounded-sm'
              >
                {Icon && <Icon className='h-2.5 w-2.5' />}
                {mention.label}
                <button
                  onClick={() => handleRemoveMention(idx)}
                  aria-label={`Remove ${mention.label}`}
                  tabIndex={0}
                  className='ml-0.5 hover:text-destructive transition-colors'
                >
                  <X className='h-2.5 w-2.5' />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Input row */}
      <div className='flex gap-2'>
        {/* @ button */}
        <button
          onClick={handleAtButtonClick}
          disabled={isStreaming}
          aria-label='Attach data with @-mention'
          tabIndex={0}
          className='px-2 py-2 border-3 border-border bg-background hover:bg-muted transition-colors disabled:opacity-50 shrink-0 flex items-center'
        >
          <AtSign className='h-4 w-4' />
        </button>

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleTextareaFocus}
          placeholder={
            isStreaming
              ? 'Waiting for response...'
              : (placeholder ?? 'Ask your AI team... (type @ to attach data)')
          }
          disabled={isStreaming}
          aria-label='Message input'
          rows={1}
          className='flex-1 min-w-0 px-3 py-2 border-3 border-border font-medium text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 resize-none overflow-hidden'
          style={{maxHeight: '120px'}}
          onInput={(e) => {
            // Auto-resize textarea
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isStreaming || !text.trim()}
          aria-label='Send message'
          tabIndex={0}
          className='px-4 py-2 bg-foreground text-background font-black text-sm border-3 border-border hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0'
        >
          {isStreaming ? (
            <Loader2 className='h-4 w-4 animate-spin' />
          ) : (
            <Send className='h-4 w-4' />
          )}
          <span className='hidden sm:inline'>
            {isStreaming ? '...' : 'Send'}
          </span>
        </button>
      </div>

      {/* Mention popup — floats above via Popover */}
      <MentionPopup
        ref={popupRef}
        open={popupOpen}
        filterText={filterText}
        triggeredByButton={triggeredByButton}
        onSelect={handleMentionSelect}
        onClose={closePopup}
      />
    </div>
  );
};

export default ChatInput;

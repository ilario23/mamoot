// ============================================================
// MentionPopup — @-mention category selector with full keyboard nav
// ============================================================
//
// Floats above the chat input using Radix Popover. Supports
// full arrow-key navigation:
//   Up/Down  — move through the list
//   Right    — drill into a category with sub-items
//   Left     — go back from sub-items to categories
//   Enter    — select the highlighted item
//
// Exposes a `handleNavKey` method via ref so the parent
// (ChatInput) can forward keyboard events from the textarea
// when the popup was opened inline (typing `@`).

'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import {Popover, PopoverContent, PopoverTrigger} from '@/components/ui/popover';
import {Loader2, ChevronRight, ArrowLeft} from 'lucide-react';
import {cn} from '@/lib/utils';
import {
  MENTION_CATEGORIES,
  type MentionCategory,
  type MentionReference,
} from '@/lib/mentionTypes';
import {loadActivitySubItems, loadGearSubItems} from '@/hooks/useMentionData';
import {useStravaAuth} from '@/contexts/StravaAuthContext';

interface MentionPopupProps {
  /** Whether the popup is open. */
  open: boolean;
  /** Current inline filter text (text after `@`). */
  filterText: string;
  /** Whether the popup was opened via the @ button (vs inline typing). */
  triggeredByButton: boolean;
  /** Called when the user selects a mention. */
  onSelect: (mention: MentionReference) => void;
  /** Called to close the popup. */
  onClose: () => void;
}

/** Methods exposed to the parent via ref. */
export interface MentionPopupHandle {
  /** Handle a navigation key press. Returns true if the key was consumed. */
  handleNavKey: (key: string) => boolean;
}

interface SubItem {
  id: string;
  label: string;
}

const MentionPopup = forwardRef<MentionPopupHandle, MentionPopupProps>(
  ({open, filterText, triggeredByButton, onSelect, onClose}, ref) => {
    const {athlete} = useStravaAuth();
    const [activeCategory, setActiveCategory] =
      useState<MentionCategory | null>(null);
    const [subItems, setSubItems] = useState<SubItem[]>([]);
    const [loadingSubItems, setLoadingSubItems] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [localSearch, setLocalSearch] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const resetPopupState = useCallback(() => {
      setActiveCategory(null);
      setSubItems([]);
      setLoadingSubItems(false);
      setHighlightedIndex(0);
      setLocalSearch('');
    }, []);

    const loadSubItemsForCategory = useCallback(
      async (category: MentionCategory, athleteId: number | null) => {
        if (!category.hasSubItems) return;

        setLoadingSubItems(true);
        if (!athleteId) {
          setSubItems([]);
          setLoadingSubItems(false);
          return;
        }

        let items: SubItem[] = [];
        if (category.id === 'activity') {
          items = await loadActivitySubItems(athleteId);
        } else if (category.id === 'gear') {
          items = await loadGearSubItems(athleteId);
        }
        setSubItems(items);
        setLoadingSubItems(false);
      },
      [],
    );

    // Effective search: localSearch in button mode, filterText in inline mode
    const effectiveSearch = triggeredByButton ? localSearch : filterText;

    // Focus the command input when opened via button (Level 1 only)
    useEffect(() => {
      if (open && triggeredByButton && !activeCategory) {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }, [open, triggeredByButton, activeCategory]);

    // Filter categories based on search text
    const filteredCategories = useMemo(() => {
      if (!effectiveSearch) return MENTION_CATEGORIES;
      const lower = effectiveSearch.toLowerCase();
      return MENTION_CATEGORIES.filter(
        (cat) =>
          cat.id.toLowerCase().includes(lower) ||
          cat.label.toLowerCase().includes(lower),
      );
    }, [effectiveSearch]);

    // Filter sub-items based on local search (button mode Level 2)
    const filteredSubItems = useMemo(() => {
      if (!activeCategory || !localSearch) return subItems;
      const lower = localSearch.toLowerCase();
      return subItems.filter((item) =>
        item.label.toLowerCase().includes(lower),
      );
    }, [activeCategory, subItems, localSearch]);

    // Scroll highlighted item into view
    useEffect(() => {
      const el = listRef.current?.querySelector('[data-highlighted="true"]');
      el?.scrollIntoView({block: 'nearest'});
    }, [highlightedIndex]);

    const handleCategorySelect = useCallback(
      (category: MentionCategory) => {
        if (category.hasSubItems) {
          setHighlightedIndex(0);
          setLocalSearch('');
          setActiveCategory(category);
          void loadSubItemsForCategory(category, athlete?.id ?? null);
        } else {
          onSelect({
            categoryId: category.id,
            label: `@${category.id}`,
          });
        }
      },
      [onSelect, loadSubItemsForCategory, athlete?.id],
    );

    const handleSubItemSelect = useCallback(
      (item: SubItem) => {
        if (!activeCategory) return;
        const shortLabel = item.label.split(' | ')[1] ?? item.label;
        onSelect({
          categoryId: activeCategory.id,
          itemId: item.id,
          label: `@${activeCategory.id}: ${shortLabel}`,
        });
      },
      [activeCategory, onSelect],
    );

    const handleBack = useCallback(() => {
      setActiveCategory(null);
      setSubItems([]);
      setHighlightedIndex(0);
      setLocalSearch('');
    }, []);

    // Number of navigable items in the current level
    // Level 2 includes "Back" at index 0, then sub-items at 1..n
    const itemCount = activeCategory
      ? 1 + filteredSubItems.length
      : filteredCategories.length;
    const effectiveHighlightedIndex = Math.min(
      highlightedIndex,
      Math.max(itemCount - 1, 0),
    );

    // Core navigation handler shared by ref (inline) and capture (button)
    const handleNavKey = useCallback(
      (key: string): boolean => {
        if (loadingSubItems) return false;

        const count = Math.max(itemCount, 1);

        if (key === 'ArrowDown') {
          setHighlightedIndex((prev) => (prev + 1) % count);
          return true;
        }
        if (key === 'ArrowUp') {
          setHighlightedIndex((prev) => (prev - 1 + count) % count);
          return true;
        }
        if (key === 'ArrowRight') {
          // Level 1: drill into category with sub-items
          if (!activeCategory) {
            const cat = filteredCategories[effectiveHighlightedIndex];
            if (cat?.hasSubItems) {
              handleCategorySelect(cat);
              return true;
            }
          }
          return false;
        }
        if (key === 'ArrowLeft') {
          // Level 2: go back
          if (activeCategory) {
            handleBack();
            return true;
          }
          return false;
        }
        if (key === 'Enter') {
          if (!activeCategory) {
            // Level 1: select highlighted category
            const cat = filteredCategories[effectiveHighlightedIndex];
            if (cat) handleCategorySelect(cat);
          } else {
            // Level 2: index 0 = Back, 1..n = sub-items
            if (effectiveHighlightedIndex === 0) {
              handleBack();
            } else {
              const item = filteredSubItems[effectiveHighlightedIndex - 1];
              if (item) handleSubItemSelect(item);
            }
          }
          return true;
        }
        return false;
      },
      [
        activeCategory,
        filteredCategories,
        filteredSubItems,
        effectiveHighlightedIndex,
        itemCount,
        loadingSubItems,
        handleCategorySelect,
        handleSubItemSelect,
        handleBack,
      ],
    );

    // Expose to parent (ChatInput) for inline-mode keyboard forwarding
    useImperativeHandle(ref, () => ({handleNavKey}), [handleNavKey]);

    // Capture keyboard events inside the popup (button mode)
    const handleKeyDownCapture = useCallback(
      (e: React.KeyboardEvent) => {
        if (
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(
            e.key,
          )
        ) {
          const handled = handleNavKey(e.key);
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      },
      [handleNavKey],
    );

    // Handle search input changes (button mode)
    const handleSearchChange = useCallback((value: string) => {
      setLocalSearch(value);
      setHighlightedIndex(0);
    }, []);

    // Styling helpers
    const highlightClass = 'bg-accent text-accent-foreground';
    const neutralize =
      "data-[selected='true']:bg-transparent data-[selected=true]:text-inherit";

    return (
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            resetPopupState();
            onClose();
          }
        }}
      >
        <PopoverTrigger asChild>
          <span className='absolute bottom-full left-0 w-0 h-0' aria-hidden />
        </PopoverTrigger>
        <PopoverContent
          className='w-[300px] p-0 border-3 border-border shadow-neo'
          side='top'
          align='start'
          sideOffset={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Wrapper captures keyboard before cmdk processes it */}
          <div onKeyDownCapture={handleKeyDownCapture}>
            <Command className='border-0' shouldFilter={false}>
              {/* Show search input when opened via button or in Level 2 */}
              {(triggeredByButton || activeCategory) && (
                <CommandInput
                  ref={inputRef}
                  value={localSearch}
                  onValueChange={handleSearchChange}
                  placeholder={
                    activeCategory
                      ? `Search ${activeCategory.label}...`
                      : 'Search data to attach...'
                  }
                  className='text-xs'
                />
              )}

              <CommandList ref={listRef} className='max-h-[240px]'>
                {/* Level 1: Category list */}
                {!activeCategory && (
                  <CommandGroup heading='Attach Data'>
                    {filteredCategories.map((cat, idx) => {
                      const Icon = cat.icon;
                      const isHighlighted = idx === effectiveHighlightedIndex;
                      return (
                        <CommandItem
                          key={cat.id}
                          value={cat.id + ' ' + cat.label}
                          onSelect={() => handleCategorySelect(cat)}
                          data-highlighted={isHighlighted}
                          className={cn(
                            'flex items-center gap-2 cursor-pointer',
                            neutralize,
                            isHighlighted && highlightClass,
                          )}
                        >
                          <Icon className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
                          <div className='flex-1 min-w-0'>
                            <span className='text-xs font-bold block'>
                              @{cat.id}
                            </span>
                            <span className='text-[10px] text-muted-foreground block truncate'>
                              {cat.description}
                            </span>
                          </div>
                          {cat.hasSubItems && (
                            <ChevronRight className='h-3 w-3 shrink-0 text-muted-foreground' />
                          )}
                        </CommandItem>
                      );
                    })}
                    {filteredCategories.length === 0 && (
                      <div className='py-3 text-center text-xs text-muted-foreground'>
                        No matching categories.
                      </div>
                    )}
                  </CommandGroup>
                )}

                {/* Level 2: Sub-item list */}
                {activeCategory && (
                  <CommandGroup>
                    <CommandItem
                      onSelect={handleBack}
                      data-highlighted={effectiveHighlightedIndex === 0}
                      className={cn(
                        'flex items-center gap-1.5 cursor-pointer text-muted-foreground mb-1',
                        neutralize,
                        effectiveHighlightedIndex === 0 && highlightClass,
                      )}
                    >
                      <ArrowLeft className='h-3 w-3' />
                      <span className='text-[10px] font-bold uppercase tracking-wider'>
                        Back
                      </span>
                    </CommandItem>

                    {loadingSubItems && (
                      <div className='flex items-center justify-center py-4 text-xs text-muted-foreground'>
                        <Loader2 className='h-3 w-3 animate-spin mr-1.5' />
                        Loading...
                      </div>
                    )}

                    {!loadingSubItems &&
                      filteredSubItems.map((item, idx) => {
                        const isHighlighted = idx + 1 === effectiveHighlightedIndex;
                        return (
                          <CommandItem
                            key={item.id}
                            value={item.label}
                            onSelect={() => handleSubItemSelect(item)}
                            data-highlighted={isHighlighted}
                            className={cn(
                              'cursor-pointer',
                              neutralize,
                              isHighlighted && highlightClass,
                            )}
                          >
                            <span className='text-xs truncate'>
                              {item.label}
                            </span>
                          </CommandItem>
                        );
                      })}

                    {!loadingSubItems && filteredSubItems.length === 0 && (
                      <div className='py-3 text-center text-xs text-muted-foreground'>
                        No items available.
                      </div>
                    )}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);

MentionPopup.displayName = 'MentionPopup';

export default MentionPopup;

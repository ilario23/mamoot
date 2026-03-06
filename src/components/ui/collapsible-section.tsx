'use client';

import {useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {useIsMobile} from '@/hooks/use-mobile';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Whether to default open on mobile. Defaults to false (collapsed on mobile). */
  defaultOpenMobile?: boolean;
  /** Whether to default open on desktop. Defaults to true. */
  defaultOpenDesktop?: boolean;
}

const CollapsibleSection = ({
  title,
  subtitle,
  children,
  defaultOpenMobile = false,
  defaultOpenDesktop = true,
}: CollapsibleSectionProps) => {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState<boolean | null>(null);

  const resolvedOpen = isOpen ?? (isMobile ? defaultOpenMobile : defaultOpenDesktop);

  const handleToggle = () => {
    setIsOpen(!resolvedOpen);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div className="border-3 border-border bg-background shadow-neo overflow-hidden">
      <button
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className="w-full flex items-center justify-between p-4 md:p-5 hover:bg-muted/50 transition-colors cursor-pointer"
        aria-expanded={resolvedOpen}
        aria-label={`${resolvedOpen ? 'Collapse' : 'Expand'} ${title}`}
        tabIndex={0}
      >
        <div className="text-left">
          <h3 className="font-black text-base md:text-lg uppercase tracking-wider">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs font-bold text-muted-foreground mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 transition-transform duration-200 ${
            resolvedOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>
      <div
        className="px-4 pb-4 md:px-5 md:pb-5"
        style={{display: resolvedOpen ? undefined : 'none'}}
      >
        {children}
      </div>
    </div>
  );
};

export default CollapsibleSection;

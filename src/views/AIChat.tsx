'use client';

import {useState} from 'react';
import Link from 'next/link';
import {
  Target,
  ChevronDown,
  Pencil,
  AlertTriangle,
  Stethoscope,
} from 'lucide-react';
import AITeamChat from '@/components/layout/AITeamChat';
import {useSettings} from '@/contexts/SettingsContext';

const AIChat = () => {
  const {settings} = useSettings();
  const [infoExpanded, setInfoExpanded] = useState(false);

  const goal = settings.goal?.trim();
  const allergies = settings.allergies ?? [];
  const injuries = settings.injuries ?? [];
  const hasAnyInfo = !!goal || allergies.length > 0 || injuries.length > 0;

  const handleToggleInfo = () => {
    setInfoExpanded((prev) => !prev);
  };

  return (
    <div className='flex flex-col h-full w-full overflow-hidden -mx-4 px-0 md:mx-0'>
      {/* Top bar: Title (desktop) + Collapsible info */}
      <div className='flex items-start gap-3 mb-0 md:mb-3 px-4 md:px-0'>
        {/* Page title — hidden on mobile */}
        <h1 className='hidden md:block text-3xl md:text-4xl font-black uppercase tracking-tight border-l-[5px] border-page pl-3 shrink-0 leading-none py-1'>
          AI Team
        </h1>

        {/* Collapsible info bar — right of title */}
        <div className='flex-1 min-w-0'>
          <button
            onClick={handleToggleInfo}
            aria-label='Toggle athlete profile info'
            aria-expanded={infoExpanded}
            tabIndex={0}
            className='w-full flex items-center gap-2 px-3 py-2 border-3 border-border bg-background hover:bg-muted transition-colors text-left shadow-neo-sm'
          >
            <div className='w-6 h-6 bg-primary rounded-full border-2 border-border flex items-center justify-center shrink-0'>
              <Target className='h-3 w-3 text-primary-foreground' />
            </div>
            <div className='flex-1 min-w-0 flex items-center gap-2 text-xs font-bold truncate'>
              {goal ? (
                <span className='truncate'>{goal}</span>
              ) : (
                <span className='text-muted-foreground italic'>
                  No goal set
                </span>
              )}
              {allergies.length > 0 && (
                <span className='inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-destructive/10 text-destructive text-[10px] font-black rounded shrink-0'>
                  <AlertTriangle className='h-2.5 w-2.5' />
                  {allergies.length}
                </span>
              )}
              {injuries.length > 0 && (
                <span className='inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[10px] font-black rounded shrink-0'>
                  <Stethoscope className='h-2.5 w-2.5' />
                  {injuries.length}
                </span>
              )}
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                infoExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Expanded info panel */}
          {infoExpanded && (
            <div className='border-3 border-t-0 border-border bg-background p-3 space-y-3 shadow-neo-sm'>
              {/* Goal */}
              <div>
                <span className='font-black text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5'>
                  Training Goal
                </span>
                {goal ? (
                  <p className='text-sm font-bold'>{goal}</p>
                ) : (
                  <p className='text-sm text-muted-foreground italic'>
                    Not set
                  </p>
                )}
              </div>

              {/* Allergies */}
              <div>
                <span className='font-black text-[10px] uppercase tracking-wider text-muted-foreground block mb-1'>
                  Allergies
                </span>
                {allergies.length > 0 ? (
                  <div className='flex flex-wrap gap-1'>
                    {allergies.map((allergy) => (
                      <span
                        key={allergy}
                        className='px-2 py-0.5 bg-destructive/10 text-destructive text-xs font-bold border border-destructive/20 rounded'
                      >
                        {allergy}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className='text-xs text-muted-foreground italic'>None</p>
                )}
              </div>

              {/* Injuries */}
              <div>
                <span className='font-black text-[10px] uppercase tracking-wider text-muted-foreground block mb-1'>
                  Injuries
                </span>
                {injuries.length > 0 ? (
                  <div className='space-y-1'>
                    {injuries.map((injury, index) => (
                      <div key={index} className='text-xs'>
                        <span className='font-bold'>{injury.name}</span>
                        {injury.notes && (
                          <span className='text-muted-foreground font-medium'>
                            {' '}
                            — {injury.notes}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className='text-xs text-muted-foreground italic'>None</p>
                )}
              </div>

              {/* Edit link */}
              <Link
                href='/settings'
                tabIndex={0}
                aria-label='Edit profile in settings'
                className='inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors pt-1'
              >
                <Pencil className='h-3 w-3' />
                Edit in Settings
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Chat area with integrated sidebar */}
      <div className='flex-1 md:border-3 md:border-border bg-background md:shadow-neo overflow-hidden'>
        <AITeamChat />
      </div>
    </div>
  );
};

export default AIChat;

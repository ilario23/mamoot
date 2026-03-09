'use client';

import {useMemo, useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {
  Target,
  ChevronDown,
  Pencil,
  AlertTriangle,
  Stethoscope,
} from 'lucide-react';
import AITeamChat from '@/components/layout/AITeamChat';
import {useSettings} from '@/contexts/SettingsContext';
import {
  buildWeeklyPlanQuickAskDraft,
  isWeeklyPlanQuickAskAction,
} from '@/lib/weeklyPlanQuickAsk';

const AIChat = () => {
  const {settings, isLoadingSettings} = useSettings();
  const searchParams = useSearchParams();
  const [infoExpanded, setInfoExpanded] = useState(false);

  const goal = settings.goal?.trim();
  const allergies = settings.allergies ?? [];
  const injuries = settings.injuries ?? [];
  const hasAnyInfo = !!goal || allergies.length > 0 || injuries.length > 0;

  const initialDraft = useMemo(() => {
    if (searchParams.get('quickAsk') !== '1') return null;
    const action = searchParams.get('action');
    if (!isWeeklyPlanQuickAskAction(action)) return null;
    const isCreationAction =
      action === 'create_weekly_plan' || action === 'create_training_block';
    if (isCreationAction && isLoadingSettings) {
      // Avoid using default settings snapshot (e.g. 50/50) before Neon settings load.
      return null;
    }
    const allergyNames = (settings.allergies ?? []).map((item) => item.trim()).filter(Boolean);
    const injurySummaries = (settings.injuries ?? [])
      .map((injury) => {
        const name = injury?.name?.trim();
        const notes = injury?.notes?.trim();
        if (!name) return null;
        return notes ? `${name} (${notes})` : name;
      })
      .filter((item): item is string => Boolean(item));
    const weekStart = searchParams.get('weekStart');
    const title = searchParams.get('title');
    const settingsFingerprint = [
      settings.goal ?? '',
      settings.trainingBalance ?? '',
      allergyNames.join('|'),
      injurySummaries.join('|'),
    ].join('::');
    const draft = buildWeeklyPlanQuickAskDraft(action, {
      weekStart,
      weekTitle: title,
      athleteGoal: settings.goal ?? null,
      allergyNames,
      injurySummaries,
      trainingBalance: settings.trainingBalance ?? null,
    });
    return {
      ...draft,
      id: `weekly-quick-ask-${action}-${weekStart ?? 'no-week'}-${title ?? 'no-title'}-${settingsFingerprint}`,
    };
  }, [searchParams, settings, isLoadingSettings]);

  const handleToggleInfo = () => {
    setInfoExpanded((prev) => !prev);
  };

  return (
    <div className='flex flex-col h-full w-full overflow-hidden'>
      {/* Top bar: Title (desktop) + Collapsible info */}
      <div className='flex items-start gap-3 mb-0 md:mb-3 px-3 md:px-0'>
        {/* Page title — hidden on mobile */}
        <h1 className='hidden md:block text-4xl md:text-5xl font-black uppercase tracking-tight border-l-[7px] border-page pl-3 shrink-0 leading-none py-1'>
          AI Team
        </h1>

        {/* Collapsible info bar — right of title */}
        <div className='flex-1 min-w-0'>
          <button
            onClick={handleToggleInfo}
            aria-label='Toggle athlete profile info'
            aria-expanded={infoExpanded}
            tabIndex={0}
            className='w-full flex items-center gap-2 px-3 py-2 border-3 border-border bg-background text-left shadow-neo-sm transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none active:translate-x-1 active:translate-y-1'
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
            <div className='border-3 border-t-0 border-border bg-background p-3 space-y-3 shadow-neo'>
              {/* Goal */}
              <div className='border-l-[3px] border-primary pl-2'>
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
              <div className='border-l-[3px] border-destructive pl-2'>
                <span className='font-black text-[10px] uppercase tracking-wider text-muted-foreground block mb-1'>
                  Allergies
                </span>
                {allergies.length > 0 ? (
                  <div className='flex flex-wrap gap-1'>
                    {allergies.map((allergy) => (
                      <span
                        key={allergy}
                        className='px-2 py-0.5 bg-destructive/10 text-destructive text-xs font-bold border-2 border-destructive/30'
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
              <div className='border-l-[3px] border-secondary pl-2'>
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
        <AITeamChat
          initialDraft={initialDraft}
        />
      </div>
    </div>
  );
};

export default AIChat;

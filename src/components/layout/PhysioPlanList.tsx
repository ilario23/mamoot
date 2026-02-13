'use client';

import {useState} from 'react';
import {
  Stethoscope,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Dumbbell,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {PhysioPlan} from '@/hooks/usePhysioPlan';

import {SESSION_TYPE_COLORS} from '@/lib/planConstants';

// ----- Props -----

interface PhysioPlanListProps {
  plans: PhysioPlan[];
  onDelete: (planId: string) => Promise<void>;
  onClose: () => void;
}

// ----- Component -----

const PhysioPlanList = ({
  plans,
  onDelete,
  onClose,
}: PhysioPlanListProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleToggleExpand = (planId: string) => {
    setExpandedId((prev) => (prev === planId ? null : planId));
    setConfirmDeleteId(null);
  };

  const handleDelete = async (planId: string) => {
    if (confirmDeleteId === planId) {
      await onDelete(planId);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(planId);
    }
  };

  return (
    <div className='flex flex-col h-full'>
      {/* Header */}
      <div className='px-4 py-3 border-b-3 border-border flex items-center justify-between'>
        <span className='font-black text-sm uppercase tracking-wider flex items-center gap-1.5'>
          <Stethoscope className='h-4 w-4' />
          Physio Plans
          <span className='text-muted-foreground font-bold'>
            ({plans.length})
          </span>
        </span>
        <button
          onClick={onClose}
          aria-label='Close physio plan list'
          tabIndex={0}
          className='p-1 text-muted-foreground hover:text-foreground transition-colors'
        >
          <X className='h-4 w-4' />
        </button>
      </div>

      {/* Plans list */}
      <div className='flex-1 overflow-y-auto'>
        {plans.length === 0 && (
          <div className='px-4 py-8 text-center text-xs text-muted-foreground'>
            <Stethoscope className='h-6 w-6 mx-auto mb-2 opacity-40' />
            <p className='font-bold'>No plans yet</p>
            <p className='mt-1'>
              Ask the Physio to create a strength plan and it will appear here.
            </p>
          </div>
        )}

        {plans.map((plan) => {
          const isExpanded = expandedId === plan.id;
          const isConfirmingDelete = confirmDeleteId === plan.id;

          return (
            <div
              key={plan.id}
              className='border-b border-border/50'
            >
              {/* Plan header — click to expand */}
              <button
                onClick={() => handleToggleExpand(plan.id)}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} plan: ${plan.title}`}
                tabIndex={0}
                className='w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors'
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <span className='font-black text-xs truncate block'>
                      {plan.title}
                    </span>
                    <div className='flex items-center gap-2 mt-1 text-[10px] text-muted-foreground'>
                      <span>
                        {new Date(plan.sharedAt).toLocaleDateString()}
                      </span>
                      {plan.phase && (
                        <span className='px-1 py-0.5 border border-border bg-muted font-bold uppercase'>
                          {plan.phase}
                        </span>
                      )}
                      {plan.strengthSessionsPerWeek && (
                        <span className='flex items-center gap-0.5'>
                          <Dumbbell className='h-2.5 w-2.5' />
                          {plan.strengthSessionsPerWeek}x/wk
                        </span>
                      )}
                    </div>
                    {plan.summary && (
                      <p className='text-[11px] text-muted-foreground mt-1 line-clamp-2'>
                        {plan.summary}
                      </p>
                    )}
                  </div>
                  <div className='shrink-0 pt-0.5'>
                    {isExpanded ? (
                      <ChevronUp className='h-3.5 w-3.5 text-muted-foreground' />
                    ) : (
                      <ChevronDown className='h-3.5 w-3.5 text-muted-foreground' />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className='px-4 pb-3 space-y-3'>
                  {/* Sessions overview */}
                  {plan.sessions.length > 0 && (
                    <div className='space-y-1'>
                      <span className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
                        Sessions
                      </span>
                      {plan.sessions.map((session, i) => (
                        <div
                          key={i}
                          className='text-[11px] font-medium space-y-0.5'
                        >
                          <div className='flex items-center gap-2'>
                            <span className='w-14 shrink-0 font-bold text-muted-foreground truncate'>
                              {session.day}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${SESSION_TYPE_COLORS[session.type] ?? 'bg-muted text-foreground'}`}
                            >
                              {session.type}
                            </span>
                            {session.duration && (
                              <span className='text-muted-foreground'>
                                {session.duration}
                              </span>
                            )}
                          </div>
                          {session.exercises.length > 0 && (
                            <div className='pl-16 text-[10px] text-muted-foreground space-y-0.5'>
                              {session.exercises.slice(0, 3).map((ex, j) => (
                                <div key={j}>
                                  {ex.name}
                                  {ex.sets && ex.reps ? ` — ${ex.sets}x${ex.reps}` : ''}
                                </div>
                              ))}
                              {session.exercises.length > 3 && (
                                <div className='italic'>
                                  +{session.exercises.length - 3} more
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Full plan content */}
                  <details className='group'>
                    <summary className='text-[10px] font-black uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors'>
                      Full Plan Details
                    </summary>
                    <div className='mt-2 prose-sm text-xs overflow-hidden border-2 border-border p-2 bg-background max-h-[300px] overflow-y-auto'>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {plan.content}
                      </ReactMarkdown>
                    </div>
                  </details>

                  {/* Delete button */}
                  <div className='flex items-center gap-2 pt-1'>
                    <button
                      onClick={() => handleDelete(plan.id)}
                      aria-label={
                        isConfirmingDelete
                          ? `Confirm delete "${plan.title}"`
                          : `Delete "${plan.title}"`
                      }
                      tabIndex={0}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border transition-colors ${
                        isConfirmingDelete
                          ? 'bg-destructive text-destructive-foreground'
                          : 'bg-background text-muted-foreground hover:text-destructive hover:border-destructive'
                      }`}
                    >
                      <Trash2 className='h-3 w-3' />
                      {isConfirmingDelete ? 'Confirm' : 'Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PhysioPlanList;

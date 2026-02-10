'use client';

import {useState, useRef, useEffect, useMemo, useCallback} from 'react';
import {
  Dumbbell,
  Apple,
  Stethoscope,
  Send,
  Loader2,
  AlertCircle,
  Check,
  X,
  Plus,
  MessageSquare,
  Trash2,
  Menu,
  ClipboardList,
  Calendar,
  type LucideIcon,
} from 'lucide-react';
import {useChat} from '@ai-sdk/react';
import {DefaultChatTransport} from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useAthleteSummary} from '@/hooks/useAthleteSummary';
import {useCoachPlan} from '@/hooks/useCoachPlan';
import {useChatSessions} from '@/hooks/useChatSessions';
import {
  useChatPersistence,
  MAX_MESSAGES_IN_CONTEXT,
} from '@/hooks/useChatPersistence';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {DEFAULT_MODEL} from '@/lib/mockData';
import type {PersonaId} from '@/lib/aiPrompts';
import type {ShareTrainingPlanInput} from '@/lib/aiTools';
import type {PlanSession} from '@/lib/db';
import {Sheet, SheetContent, SheetTitle} from '@/components/ui/sheet';
import CoachPlanList from '@/components/layout/CoachPlanList';

// ----- Personas -----

interface Persona {
  id: PersonaId;
  label: string;
  icon: LucideIcon;
  color: string;
}

const personas: Persona[] = [
  {id: 'coach', label: 'Coach', icon: Dumbbell, color: 'bg-secondary'},
  {id: 'nutritionist', label: 'Nutrition', icon: Apple, color: 'bg-zone-1'},
  {id: 'physio', label: 'Physio', icon: Stethoscope, color: 'bg-destructive'},
];

const PersonaAvatar = ({
  persona,
  size = 'sm',
}: {
  persona: Persona;
  size?: 'sm' | 'md';
}) => {
  const sizeClasses = size === 'md' ? 'w-9 h-9' : 'w-7 h-7';
  const iconSize = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div
      className={`${sizeClasses} ${persona.color} rounded-full border-3 border-border flex items-center justify-center shadow-neo-sm shrink-0`}
    >
      <persona.icon className={`${iconSize} text-foreground`} />
    </div>
  );
};

// ----- Markdown renderer for AI messages -----

const MarkdownContent = ({content}: {content: string}) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({children}) => <p className='mb-2 last:mb-0'>{children}</p>,
      ul: ({children}) => <ul className='list-disc ml-4 mb-2'>{children}</ul>,
      ol: ({children}) => (
        <ol className='list-decimal ml-4 mb-2'>{children}</ol>
      ),
      li: ({children}) => <li className='mb-0.5'>{children}</li>,
      strong: ({children}) => (
        <strong className='font-black'>{children}</strong>
      ),
      h1: ({children}) => (
        <h1 className='font-black text-base mb-1'>{children}</h1>
      ),
      h2: ({children}) => (
        <h2 className='font-black text-sm mb-1'>{children}</h2>
      ),
      h3: ({children}) => (
        <h3 className='font-bold text-sm mb-1'>{children}</h3>
      ),
      code: ({children, className}) => {
        const isInline = !className;
        if (isInline) {
          return (
            <code className='bg-muted px-1 py-0.5 rounded text-xs font-mono'>
              {children}
            </code>
          );
        }
        return (
          <pre className='bg-muted border-2 border-border p-2 rounded text-xs font-mono overflow-x-auto mb-2'>
            <code>{children}</code>
          </pre>
        );
      },
      table: ({children}) => (
        <div className='overflow-x-auto mb-2'>
          <table className='w-full text-xs border-3 border-border'>
            {children}
          </table>
        </div>
      ),
      th: ({children}) => (
        <th className='border-2 border-border px-2 py-1 bg-muted font-black text-left'>
          {children}
        </th>
      ),
      td: ({children}) => (
        <td className='border-2 border-border px-2 py-1'>{children}</td>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
);

// ----- Plan card displayed inline when the AI calls shareTrainingPlan -----

const SESSION_TYPE_COLORS: Record<string, string> = {
  easy: 'bg-zone-1/20 text-zone-1',
  intervals: 'bg-zone-4/20 text-zone-4',
  tempo: 'bg-zone-3/20 text-zone-3',
  long: 'bg-zone-2/20 text-zone-2',
  rest: 'bg-muted text-muted-foreground',
  strength: 'bg-secondary/20 text-secondary',
  recovery: 'bg-zone-1/20 text-zone-1',
};

const PlanCard = ({
  plan,
  isSaved,
}: {
  plan: ShareTrainingPlanInput;
  isSaved: boolean;
}) => (
  <div className='mt-2 border-3 border-primary bg-primary/5 p-3 space-y-2'>
    <div className='flex items-start justify-between gap-2'>
      <div>
        <span className='font-black text-xs uppercase tracking-wider text-primary flex items-center gap-1'>
          <ClipboardList className='h-3 w-3' />
          Training Plan
        </span>
        <h4 className='font-black text-sm mt-0.5'>{plan.title}</h4>
        {plan.summary && (
          <p className='text-xs text-muted-foreground mt-0.5'>
            {plan.summary}
          </p>
        )}
      </div>
      {isSaved && (
        <span className='inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-primary shrink-0'>
          <Check className='h-3 w-3' />
          Saved
        </span>
      )}
    </div>

    {(plan.goal || plan.durationWeeks) && (
      <div className='flex flex-wrap gap-2 text-[10px] font-bold'>
        {plan.goal && (
          <span className='px-1.5 py-0.5 border-2 border-border bg-muted'>
            {plan.goal}
          </span>
        )}
        {plan.durationWeeks && (
          <span className='px-1.5 py-0.5 border-2 border-border bg-muted flex items-center gap-1'>
            <Calendar className='h-2.5 w-2.5' />
            {plan.durationWeeks}w
          </span>
        )}
      </div>
    )}

    {plan.sessions.length > 0 && (
      <div className='space-y-1'>
        {plan.sessions.map((session, i) => (
          <div
            key={i}
            className='flex items-center gap-2 text-[11px] font-medium'
          >
            <span className='w-16 shrink-0 font-bold text-muted-foreground truncate'>
              {session.day}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${SESSION_TYPE_COLORS[session.type] ?? 'bg-muted text-foreground'}`}
            >
              {session.type}
            </span>
            <span className='truncate'>{session.description}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

const PlanSaving = () => (
  <div className='mt-2 border-3 border-border bg-muted/50 p-3 flex items-center gap-2 text-xs font-medium text-muted-foreground'>
    <Loader2 className='h-3 w-3 animate-spin' />
    Saving training plan...
  </div>
);

// ----- Session-aware chat instance -----

const usePersistentChat = (sessionId: string | null) => {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
      }),
    [],
  );

  const chat = useChat({
    id: sessionId ? `session-${sessionId}` : 'ai-team-pending',
    transport,
  });

  return chat;
};

// ----- Main component -----

const AITeamChat = () => {
  const [activePersona, setActivePersona] = useState<PersonaId>('coach');
  const [input, setInput] = useState('');
  const [memory, setMemory] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [planListOpen, setPlanListOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {athlete} = useStravaAuth();
  const {settings} = useSettings();
  const selectedModel = settings.aiModel ?? DEFAULT_MODEL;
  const {serialized: athleteContext, isLoading: contextLoading} =
    useAthleteSummary();
  const athleteId = athlete?.id ?? null;
  const {plans, activePlan, savePlan, activatePlan, deletePlan} =
    useCoachPlan(athleteId);

  // Session management per persona
  const coachSessions = useChatSessions(athleteId, 'coach');
  const nutritionistSessions = useChatSessions(athleteId, 'nutritionist');
  const physioSessions = useChatSessions(athleteId, 'physio');

  const sessionManagers = useMemo(
    () => ({
      coach: coachSessions,
      nutritionist: nutritionistSessions,
      physio: physioSessions,
    }),
    [coachSessions, nutritionistSessions, physioSessions],
  );

  const activeSM = sessionManagers[activePersona];
  const activeSession = activeSM.activeSession;
  const currentPersona =
    personas.find((p) => p.id === activePersona) ?? personas[0];

  // Persistence
  const {loadMessages, persistMessage, getMemorySummary, maybeTriggerSummary} =
    useChatPersistence();

  // Single chat instance keyed by active session
  const activeChat = usePersistentChat(activeSession?.id ?? null);

  // Load persisted messages when session changes
  const loadedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    const sid = activeSession?.id ?? null;
    if (!sid || sid === loadedSessionRef.current) return;
    loadedSessionRef.current = sid;

    const load = async () => {
      const messages = await loadMessages(sid);
      if (messages.length > 0) {
        activeChat.setMessages(messages);
      } else {
        activeChat.setMessages([]);
      }

      // Load memory summary
      const summary = await getMemorySummary(sid);
      setMemory(summary);
    };

    load();
  }, [activeSession?.id, loadMessages, getMemorySummary, activeChat]);

  // Auto-scroll on new messages or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChat.messages.length, activeChat.status]);

  // Persist messages when they change (after streaming completes)
  const lastPersistedCount = useRef(0);

  // Track which tool plan IDs we've already saved to Dexie
  const savedPlanIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!activeSession?.id) return;
    if (activeChat.status === 'streaming') return;

    const messages = activeChat.messages;
    if (messages.length <= lastPersistedCount.current) return;

    // Persist only the new messages
    const newMessages = messages.slice(lastPersistedCount.current);
    lastPersistedCount.current = messages.length;

    const sessionId = activeSession.id;

    (async () => {
      for (const msg of newMessages) {
        await persistMessage(sessionId, msg);

        // Detect tool results from shareTrainingPlan and save to Dexie
        if (msg.role === 'assistant' && msg.parts) {
          for (const part of msg.parts) {
            if (
              part.type === 'tool-shareTrainingPlan' &&
              'state' in part &&
              part.state === 'output-available' &&
              'output' in part &&
              part.output &&
              typeof part.output === 'object' &&
              'planId' in part.output &&
              'input' in part &&
              part.input &&
              typeof part.input === 'object'
            ) {
              const output = part.output as {planId: string; title: string; sharedAt: number};
              const planInput = part.input as ShareTrainingPlanInput;

              // Only save once
              if (!savedPlanIds.current.has(output.planId)) {
                savedPlanIds.current.add(output.planId);
                savePlan({
                  id: output.planId,
                  athleteId: athleteId ?? 0,
                  title: planInput.title,
                  summary: planInput.summary ?? null,
                  goal: planInput.goal ?? null,
                  durationWeeks: planInput.durationWeeks ?? null,
                  sessions: planInput.sessions as PlanSession[],
                  content: planInput.content,
                  sourceMessageId: msg.id,
                  sourceSessionId: sessionId,
                  sharedAt: output.sharedAt,
                });
              }
            }
          }
        }
      }

      // Update session metadata
      const firstUserMsg = messages.find((m) => m.role === 'user');
      const title = firstUserMsg
        ? firstUserMsg.parts
            ?.filter(
              (p): p is {type: 'text'; text: string} => p.type === 'text',
            )
            .map((p) => p.text)
            .join('')
            .slice(0, 50) || 'New conversation'
        : 'New conversation';

      await activeSM.updateSession(sessionId, {
        title,
        messageCount: messages.length,
      });

      // Check if summary should be triggered
      maybeTriggerSummary(sessionId, messages.length, async (summary) => {
        setMemory(summary);
        await activeSM.updateSession(sessionId, {summary});
      });
    })();
  }, [
    activeChat.messages,
    activeChat.status,
    activeSession?.id,
    persistMessage,
    activeSM,
    maybeTriggerSummary,
    savePlan,
    athleteId,
  ]);

  // Reset persisted count when session changes
  useEffect(() => {
    lastPersistedCount.current = 0;
  }, [activeSession?.id]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || activeChat.status === 'streaming') return;

    // Auto-create a session if none exists
    let session = activeSession;
    if (!session) {
      session = await activeSM.createSession();
    }

    // For long sessions, trim messages to context window
    const messages = activeChat.messages;
    const trimmedMessages =
      messages.length > MAX_MESSAGES_IN_CONTEXT
        ? messages.slice(-MAX_MESSAGES_IN_CONTEXT)
        : messages;

    // If trimming happened, set the trimmed messages first
    if (messages.length > MAX_MESSAGES_IN_CONTEXT) {
      activeChat.setMessages(trimmedMessages);
    }

    activeChat.sendMessage(
      {text: input.trim()},
      {
        body: {
          persona: activePersona,
          athleteContext,
          model: selectedModel,
          coachPlan:
            activePersona !== 'coach' && activePlan
              ? {
                  title: activePlan.title,
                  goal: activePlan.goal,
                  durationWeeks: activePlan.durationWeeks,
                  sessions: activePlan.sessions,
                  content: activePlan.content,
                }
              : null,
          memory,
          athleteId,
          sessionId: session?.id ?? null,
        },
      },
    );
    setInput('');
  }, [
    input,
    activeChat,
    activePersona,
    athleteContext,
    selectedModel,
    activePlan,
    memory,
    activeSession,
    activeSM,
    athleteId,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = useCallback(async () => {
    await activeSM.createSession();
    activeChat.setMessages([]);
    lastPersistedCount.current = 0;
    setMemory(null);
  }, [activeSM, activeChat]);

  const handleSelectSession = useCallback(
    (id: string) => {
      activeSM.selectSession(id);
      lastPersistedCount.current = 0;
      loadedSessionRef.current = null; // Force reload
    },
    [activeSM],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await activeSM.deleteSession(id);
      if (activeSM.sessions.length <= 1) {
        activeChat.setMessages([]);
        lastPersistedCount.current = 0;
        setMemory(null);
      }
    },
    [activeSM, activeChat],
  );

  const handlePersonaSwitch = useCallback((personaId: PersonaId) => {
    setActivePersona(personaId);
    loadedSessionRef.current = null; // Force reload on persona switch
    lastPersistedCount.current = 0;
  }, []);

  const isStreaming = activeChat.status === 'streaming';
  const hasError = activeChat.error;

  // ----- Sidebar content (shared between desktop and mobile drawer) -----

  const sidebarContent = (
    <div className='flex flex-col h-full'>
      {/* History header */}
      <div className='px-3 py-2 border-b-3 border-border flex items-center justify-between'>
        <span className='font-black text-xs uppercase tracking-wider'>
          History
        </span>
        <button
          onClick={() => {
            handleNewConversation();
            setSidebarOpen(false);
          }}
          aria-label='New conversation'
          tabIndex={0}
          className='flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-foreground text-background hover:bg-primary hover:text-primary-foreground transition-colors shrink-0'
        >
          <Plus className='h-3 w-3' />
          New
        </button>
      </div>

      {/* Session list */}
      <div className='flex-1 overflow-y-auto'>
        {activeSM.isLoading && (
          <div className='px-3 py-6 text-xs text-muted-foreground text-center'>
            <Loader2 className='h-4 w-4 animate-spin mx-auto mb-1' />
            Loading...
          </div>
        )}
        {!activeSM.isLoading && activeSM.sessions.length === 0 && (
          <div className='px-3 py-6 text-xs text-muted-foreground text-center'>
            <MessageSquare className='h-5 w-5 mx-auto mb-1.5 opacity-40' />
            No conversations yet
          </div>
        )}
        {activeSM.sessions.map((session) => (
          <div
            key={session.id}
            className={`group flex items-center gap-2 px-3 py-2.5 text-xs border-b border-border/50 cursor-pointer transition-colors ${
              session.id === activeSession?.id
                ? 'bg-primary/10 font-black'
                : 'hover:bg-muted font-medium'
            }`}
          >
            <button
              onClick={() => {
                handleSelectSession(session.id);
                setSidebarOpen(false);
              }}
              aria-label={`Select conversation: ${session.title}`}
              tabIndex={0}
              className='flex-1 text-left truncate min-w-0'
            >
              <span className='flex items-center gap-1.5'>
                <MessageSquare className='h-3 w-3 shrink-0 text-muted-foreground' />
                <span className='block truncate'>{session.title}</span>
              </span>
              <span className='text-[10px] text-muted-foreground ml-[18px] block'>
                {new Date(session.updatedAt).toLocaleDateString()} &middot;{' '}
                {session.messageCount} msgs
              </span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSession(session.id);
              }}
              aria-label={`Delete conversation: ${session.title}`}
              tabIndex={0}
              className='shrink-0 p-1 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all'
            >
              <Trash2 className='h-3 w-3' />
            </button>
          </div>
        ))}
      </div>

      {/* Persona switcher */}
      <div className='border-t-3 border-border bg-background shrink-0'>
        {personas.map((p) => {
          const isActive = activePersona === p.id;
          return (
            <button
              key={p.id}
              onClick={() => {
                handlePersonaSwitch(p.id);
                setSidebarOpen(false);
              }}
              aria-label={`Switch to ${p.label}`}
              tabIndex={0}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-all ${
                isActive
                  ? 'font-black text-foreground bg-primary/10'
                  : 'font-medium text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/50'
              }`}
            >
              <div className={isActive ? '' : 'opacity-30 grayscale'}>
                <PersonaAvatar persona={p} size='sm' />
              </div>
              <span>{p.label}</span>
              {isActive && (
                <div
                  className={`ml-auto w-2 h-2 rounded-full ${p.color} border border-border`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ----- Render -----

  return (
    <div className='flex h-full min-w-0 overflow-hidden'>
      {/* Plan list sheet */}
      <Sheet open={planListOpen} onOpenChange={setPlanListOpen}>
        <SheetContent side='right' className='p-0 w-[340px] sm:max-w-[340px]'>
          <SheetTitle className='sr-only'>Training Plans</SheetTitle>
          <CoachPlanList
            plans={plans}
            activePlanId={activePlan?.id ?? null}
            onActivate={activatePlan}
            onDelete={deletePlan}
            onClose={() => setPlanListOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Chat area */}
      <div className='flex-1 flex flex-col min-w-0 overflow-hidden'>
        {/* Mobile header — persona + new chat + history */}
        <div className='md:hidden px-3 py-2 border-b-3 border-border flex items-center gap-2 bg-background'>
          <div className='flex items-center gap-1.5 flex-1 min-w-0'>
            <PersonaAvatar persona={currentPersona} size='sm' />
            <span className='font-bold text-xs truncate'>
              {activeSession?.title ?? currentPersona.label}
            </span>
          </div>
          <button
            onClick={handleNewConversation}
            aria-label='New conversation'
            tabIndex={0}
            className='p-1.5 border-2 border-border hover:bg-muted transition-colors shrink-0'
          >
            <Plus className='h-4 w-4' />
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label='Open conversation history'
            tabIndex={0}
            className='p-1.5 border-2 border-border hover:bg-muted transition-colors shrink-0'
          >
            <Menu className='h-4 w-4' />
          </button>
        </div>

        {/* Desktop header — new chat button top-right */}
        <div className='hidden md:flex items-center justify-between px-3 py-1.5 border-b-3 border-border bg-background'>
          <div className='flex items-center gap-1.5 min-w-0'>
            <PersonaAvatar persona={currentPersona} size='sm' />
            <span className='font-bold text-xs truncate'>
              {activeSession?.title ?? currentPersona.label}
            </span>
          </div>
          <div className='flex items-center gap-1.5'>
            {plans.length > 0 && (
              <button
                onClick={() => setPlanListOpen(true)}
                aria-label='View training plans'
                tabIndex={0}
                className='flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background hover:bg-muted transition-colors shrink-0'
              >
                <ClipboardList className='h-3 w-3' />
                Plans ({plans.length})
              </button>
            )}
            <button
              onClick={handleNewConversation}
              aria-label='New conversation'
              tabIndex={0}
              className='flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-foreground text-background hover:bg-primary hover:text-primary-foreground transition-colors shrink-0'
            >
              <Plus className='h-3 w-3' />
              New
            </button>
          </div>
        </div>

        {/* Context loading indicator */}
        {contextLoading && (
          <div className='px-3 py-2 bg-muted/50 border-b-3 border-border flex items-center gap-2 text-xs text-muted-foreground'>
            <Loader2 className='h-3 w-3 animate-spin' />
            Loading your training data...
          </div>
        )}

        {/* Memory indicator */}
        {memory && (
          <div className='px-3 py-1.5 bg-secondary/10 border-b-3 border-border flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground'>
            <MessageSquare className='h-3 w-3 shrink-0' />
            Memory active — past conversations remembered
          </div>
        )}

        {/* Shared coach plan banner — shown on Nutritionist & Physio tabs */}
        {activePersona !== 'coach' && activePlan && (
          <div className='px-3 py-2 bg-primary/10 border-b-3 border-border flex items-center justify-between gap-2 text-xs font-bold'>
            <button
              onClick={() => setPlanListOpen(true)}
              aria-label='View training plans'
              tabIndex={0}
              className='flex items-center gap-1.5 text-foreground hover:text-primary transition-colors'
            >
              <Dumbbell className='h-3 w-3 shrink-0' />
              <span className='truncate'>{activePlan.title}</span>
              <span className='text-muted-foreground font-medium shrink-0'>
                — {new Date(activePlan.sharedAt).toLocaleDateString()}
              </span>
            </button>
            <button
              onClick={() => setPlanListOpen(true)}
              aria-label='Manage plans'
              tabIndex={0}
              className='inline-flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0'
            >
              <ClipboardList className='h-3 w-3' />
            </button>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className='flex-1 overflow-y-auto p-3 space-y-3'>
          {activeChat.messages.length === 0 && !isStreaming && (
            <div className='flex items-center justify-center h-full text-muted-foreground text-sm font-medium'>
              <div className='text-center space-y-2'>
                <PersonaAvatar persona={currentPersona} size='md' />
                <p className='font-bold'>{currentPersona.label}</p>
                <p className='text-xs max-w-[200px]'>
                  {activePersona === 'coach' &&
                    'Ask about training plans, workouts, and race strategy'}
                  {activePersona === 'nutritionist' &&
                    'Ask about fueling, hydration, and recovery nutrition'}
                  {activePersona === 'physio' &&
                    'Ask about injury prevention, mobility, and recovery'}
                </p>
              </div>
            </div>
          )}

          {activeChat.messages.map((msg) => {
            const isUser = msg.role === 'user';

            // Collect text content
            const textContent =
              msg.parts
                ?.filter(
                  (part): part is {type: 'text'; text: string} =>
                    part.type === 'text',
                )
                .map((part) => part.text)
                .join('') ?? '';

            // Check for tool call parts
            const toolParts = msg.parts?.filter(
              (part) => part.type === 'tool-shareTrainingPlan',
            ) ?? [];

            // Skip if no content at all
            if (!textContent && toolParts.length === 0) return null;

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {!isUser && (
                  <PersonaAvatar persona={currentPersona} size='md' />
                )}
                <div
                  className={`flex-1 p-3 border-3 border-border text-sm font-medium overflow-hidden break-words ${
                    isUser
                      ? 'bg-muted ml-4 md:ml-10'
                      : 'bg-accent/20 mr-4 md:mr-10'
                  }`}
                >
                  <span className='font-black text-xs uppercase mb-1 block'>
                    {isUser ? 'You' : currentPersona.label}
                  </span>
                  {isUser ? (
                    textContent
                  ) : (
                    <>
                      {textContent && (
                        <div className='prose-sm overflow-hidden'>
                          <MarkdownContent content={textContent} />
                        </div>
                      )}
                      {/* Render tool call results as plan cards */}
                      {toolParts.map((part, idx) => {
                        if (!('state' in part)) return null;
                        const toolPart = part as {
                          type: string;
                          state: string;
                          input?: ShareTrainingPlanInput;
                          output?: {planId: string; title: string; sharedAt: number};
                        };
                        if (toolPart.state !== 'output-available' || !toolPart.input) {
                          return <PlanSaving key={idx} />;
                        }
                        const isSaved = toolPart.output
                          ? savedPlanIds.current.has(toolPart.output.planId)
                          : false;
                        return (
                          <PlanCard
                            key={idx}
                            plan={toolPart.input}
                            isSaved={isSaved || !!toolPart.output}
                          />
                        );
                      })}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Streaming indicator */}
          {isStreaming &&
            activeChat.messages.length > 0 &&
            activeChat.messages[activeChat.messages.length - 1]?.role ===
              'user' && (
              <div className='flex gap-2 flex-row'>
                <PersonaAvatar persona={currentPersona} size='md' />
                <div className='p-3 border-3 border-border text-sm font-medium bg-accent/20 mr-4 md:mr-10'>
                  <span className='font-black text-xs uppercase mb-1 block'>
                    {currentPersona.label}
                  </span>
                  <div className='flex items-center gap-1'>
                    <span
                      className='w-1.5 h-1.5 bg-foreground rounded-full animate-bounce'
                      style={{animationDelay: '0ms'}}
                    />
                    <span
                      className='w-1.5 h-1.5 bg-foreground rounded-full animate-bounce'
                      style={{animationDelay: '150ms'}}
                    />
                    <span
                      className='w-1.5 h-1.5 bg-foreground rounded-full animate-bounce'
                      style={{animationDelay: '300ms'}}
                    />
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Error display */}
        {hasError && (
          <div className='px-3 py-2 bg-destructive/10 border-t-3 border-border flex items-center gap-2 text-xs text-destructive font-medium'>
            <AlertCircle className='h-3.5 w-3.5 shrink-0' />
            <span className='truncate'>
              {activeChat.error?.message ??
                'Something went wrong. Please try again.'}
            </span>
          </div>
        )}

        {/* Input */}
        <div className='p-3 border-t-3 border-border flex gap-2'>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming ? 'Waiting for response...' : 'Ask your AI team...'
            }
            disabled={isStreaming}
            aria-label='Message input'
            className='flex-1 min-w-0 px-3 py-2 border-3 border-border font-medium text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50'
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            aria-label='Send message'
            tabIndex={0}
            className='px-4 py-2 bg-foreground text-background font-black text-sm border-3 border-border hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed'
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
      </div>

      {/* Desktop history sidebar (right) — always visible on md+ */}
      <div className='hidden md:flex flex-col w-[280px] border-l-3 border-border bg-muted/30 shrink-0 overflow-hidden'>
        {sidebarContent}
      </div>

      {/* Mobile history drawer (right) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side='right' className='p-0 w-[280px] sm:max-w-[280px]'>
          <SheetTitle className='sr-only'>Conversation History</SheetTitle>
          {sidebarContent}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AITeamChat;

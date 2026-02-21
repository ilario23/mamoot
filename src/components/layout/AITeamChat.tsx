'use client';

import {useState, useRef, useEffect, useMemo, useCallback} from 'react';
import {
  Dumbbell,
  Apple,
  Stethoscope,
  Loader2,
  AlertCircle,
  Plus,
  MessageSquare,
  Trash2,
  Menu,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import {useChat} from '@ai-sdk/react';
import {DefaultChatTransport} from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useChatSessions} from '@/hooks/useChatSessions';
import {
  useChatPersistence,
  MAX_MESSAGES_IN_CONTEXT,
} from '@/hooks/useChatPersistence';
import {useMentionResolver} from '@/hooks/useMentionData';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {DEFAULT_MODEL} from '@/lib/mockData';
import type {PersonaId} from '@/lib/aiPrompts';
import {
  getMentionCategory,
  parseMentionMeta,
  type MentionReference,
} from '@/lib/mentionTypes';
import {Sheet, SheetContent, SheetTitle} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import ChatInput from '@/components/chat/ChatInput';
import StreamingIndicator from '@/components/chat/StreamingIndicator';
import SuggestionChips from '@/components/chat/SuggestionChips';
import ToolCallChip from '@/components/chat/ToolCallChip';
import type {SuggestFollowUpsInput} from '@/lib/aiTools';

// ----- Personas -----

interface Persona {
  id: PersonaId;
  label: string;
  icon: LucideIcon;
  color: string;
  /** Colored left-border class for AI chat bubbles */
  bubbleBorder: string;
  /** Text color class for the persona label inside bubbles */
  labelColor: string;
  /** Light tinted bg for banners / empty-state */
  tintBg: string;
}

const personas: Persona[] = [
  {
    id: 'coach',
    label: 'Coach',
    icon: Dumbbell,
    color: 'bg-secondary',
    bubbleBorder: 'border-l-secondary',
    labelColor: 'text-secondary',
    tintBg: 'bg-secondary/10',
  },
  {
    id: 'nutritionist',
    label: 'Nutrition',
    icon: Apple,
    color: 'bg-zone-1',
    bubbleBorder: 'border-l-zone-1',
    labelColor: 'text-zone-1',
    tintBg: 'bg-zone-1/10',
  },
  {
    id: 'physio',
    label: 'Physio',
    icon: Stethoscope,
    color: 'bg-destructive',
    bubbleBorder: 'border-l-destructive',
    labelColor: 'text-destructive',
    tintBg: 'bg-destructive/10',
  },
];

const PERSONA_STARTERS: Record<PersonaId, string[]> = {
  coach: [
    'Build me a 5K plan',
    'Review my last week',
    'What should I run today?',
  ],
  nutritionist: [
    'Pre-race fueling plan',
    'Recovery meal ideas',
    'Hydration strategy',
  ],
  physio: [
    "Prevent runner's knee",
    'Post-run stretch routine',
    'Hip mobility drills',
  ],
};

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

// ----- Tool call labels (shown as status chips while tools execute) -----

const TOOL_LABELS: Record<string, string> = {
  // Retrieval tools
  getTrainingGoal: 'Checking your training goal',
  getInjuries: 'Reviewing injury history',
  getDietaryInfo: 'Checking dietary preferences',
  getTrainingSummary: 'Analyzing training summary',
  getWeeklyBreakdown: 'Looking at weekly breakdown',
  getZoneDistribution: 'Reviewing HR zone distribution',
  getFitnessMetrics: 'Calculating fitness metrics',
  getRecentActivities: 'Looking at recent activities',
  getGearStatus: 'Checking your gear',
  getWeeklyPlan: 'Reviewing the weekly plan',
  comparePlanVsActual: 'Comparing plan vs actual',
  getActivityDetail: 'Analyzing activity details',
  getPersonalRecords: 'Looking at your personal records',
  getWeatherForecast: 'Checking the weather forecast',
  // Action tools
  suggestFollowUps: 'Preparing suggestions',
};

// ----- Collapsible tool call group -----

interface ToolChipData {
  toolName: string;
  label: string;
  done: boolean;
}

const ToolCallGroup = ({chips}: {chips: ToolChipData[]}) => {
  const [expanded, setExpanded] = useState(false);
  const allDone = chips.every((c) => c.done);
  const stillLoading = chips.filter((c) => !c.done);

  // While tools are still running, show the loading ones inline
  if (!allDone) {
    return (
      <div className='flex flex-wrap gap-1 mb-1.5'>
        {chips.map((chip) => (
          <ToolCallChip
            key={chip.toolName}
            label={chip.label}
            done={chip.done}
          />
        ))}
      </div>
    );
  }

  // All done — show collapsible "Retrieved information"
  return (
    <div className='mb-1.5'>
      <button
        onClick={() => setExpanded((prev) => !prev)}
        aria-label='Toggle retrieved information'
        aria-expanded={expanded}
        tabIndex={0}
        className='flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors'
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
        Retrieved information
        <span className='text-[10px] font-medium'>({chips.length})</span>
      </button>
      {expanded && (
        <div className='flex flex-wrap gap-1 mt-1.5 pl-[18px]'>
          {chips.map((chip) => (
            <ToolCallChip
              key={chip.toolName}
              label={chip.label}
              done={chip.done}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ----- Markdown renderer for AI messages -----

const MarkdownContent = ({content}: {content: string}) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: ({children}) => (
        <p className='mb-2 last:mb-0 leading-relaxed'>{children}</p>
      ),
      ul: ({children}) => (
        <ul className='list-disc pl-4 mb-2 space-y-0.5 marker:text-primary'>
          {children}
        </ul>
      ),
      ol: ({children}) => (
        <ol className='list-decimal pl-4 mb-2 space-y-0.5 marker:text-primary marker:font-bold'>
          {children}
        </ol>
      ),
      li: ({children}) => (
        <li className='mb-0.5 leading-relaxed'>{children}</li>
      ),
      strong: ({children}) => (
        <strong className='font-black'>{children}</strong>
      ),
      em: ({children}) => (
        <em className='italic text-muted-foreground'>{children}</em>
      ),
      h1: ({children}) => (
        <h1 className='font-black text-base mb-2 mt-3 first:mt-0 border-l-3 border-primary pl-2'>
          {children}
        </h1>
      ),
      h2: ({children}) => (
        <h2 className='font-black text-sm mb-1.5 mt-3 first:mt-0 border-l-3 border-secondary pl-2'>
          {children}
        </h2>
      ),
      h3: ({children}) => (
        <h3 className='font-bold text-sm mb-1 mt-2 first:mt-0 border-l-2 border-border pl-2'>
          {children}
        </h3>
      ),
      blockquote: ({children}) => (
        <blockquote className='border-l-3 border-primary/60 bg-muted/50 pl-3 pr-2 py-1.5 mb-2 text-muted-foreground italic'>
          {children}
        </blockquote>
      ),
      hr: () => (
        <hr className='border-t-2 border-dashed border-border/60 my-3' />
      ),
      a: ({children, href}) => (
        <a
          href={href}
          target='_blank'
          rel='noopener noreferrer'
          className='text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary font-bold transition-colors'
        >
          {children}
        </a>
      ),
      code: ({children, className}) => {
        const isInline = !className;
        if (isInline) {
          return (
            <code className='bg-muted px-1 py-0.5 text-xs font-mono border border-border/30'>
              {children}
            </code>
          );
        }
        return (
          <pre className='bg-muted border-2 border-border p-2 text-xs font-mono overflow-x-auto mb-2'>
            <code>{children}</code>
          </pre>
        );
      },
      table: ({children}) => (
        <div className='overflow-x-auto mb-2 max-w-full'>
          <table className='w-full text-xs border-3 border-border'>
            {children}
          </table>
        </div>
      ),
      thead: ({children}) => <thead className='bg-muted'>{children}</thead>,
      th: ({children}) => (
        <th className='border-2 border-border px-2 py-1.5 bg-muted font-black text-left uppercase text-[10px] tracking-wider'>
          {children}
        </th>
      ),
      td: ({children}) => (
        <td className='border-2 border-border/50 px-2 py-1'>{children}</td>
      ),
      tr: ({children}) => (
        // even/odd striping — thead rows have their own bg that takes precedence
        <tr className='even:bg-muted/30'>{children}</tr>
      ),
    }}
  >
    {content}
  </ReactMarkdown>
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
  const [memory, setMemory] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(false);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<
    string | null
  >(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {athlete} = useStravaAuth();
  const {settings} = useSettings();
  const selectedModel = settings.aiModel ?? DEFAULT_MODEL;
  const {resolveAll} = useMentionResolver();
  const athleteId = athlete?.id ?? null;

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
      try {
        const messages = await loadMessages(sid);
        if (messages.length > 0) {
          activeChat.setMessages(messages);
        } else {
          activeChat.setMessages([]);
        }
        // Mark loaded messages as already persisted so the persistence
        // effect won't re-process them (prevents re-creating deleted plans).
        lastPersistedCount.current = messages.length;

        // Load memory summary
        const summary = await getMemorySummary(sid);
        setMemory(summary);
      } catch (err) {
        console.error(
          '[AITeamChat] Failed to load messages for session',
          sid,
          err,
        );
        // Ensure the chat area is cleared so the user sees the empty state
        // rather than stale messages from a previous session
        activeChat.setMessages([]);
      }
    };

    load();
  }, [activeSession?.id, loadMessages, getMemorySummary, activeChat]);

  // Auto-scroll on new messages and while tokens stream in
  const lastMsg = activeChat.messages[activeChat.messages.length - 1];
  const lastMsgText =
    lastMsg?.parts
      ?.filter((p): p is {type: 'text'; text: string} => p.type === 'text')
      .map((p) => p.text)
      .join('') ?? '';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChat.messages.length, activeChat.status, lastMsgText.length]);

  // Persist messages when they change (after streaming completes)
  const lastPersistedCount = useRef(0);

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
      }

      // Update session metadata
      const firstUserMsg = messages.find((m) => m.role === 'user');
      const rawTitle = firstUserMsg
        ? firstUserMsg.parts
            ?.filter(
              (p): p is {type: 'text'; text: string} => p.type === 'text',
            )
            .map((p) => p.text)
            .join('') || ''
        : '';
      // Strip mention metadata so titles don't start with <!-- mentions:... -->
      const title =
        parseMentionMeta(rawTitle).cleanText.trim().slice(0, 50) ||
        'New conversation';

      // Count only messages that have parts (matching what persistMessage actually stores)
      const persistedCount = messages.filter(
        (m) => (m.parts ?? []).length > 0,
      ).length;

      await activeSM.updateSession(sessionId, {
        title,
        messageCount: persistedCount,
      });

      // Check if summary should be triggered
      maybeTriggerSummary(sessionId, persistedCount, async (summary) => {
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
  ]);

  const handleSend = useCallback(
    async (text: string, mentions: MentionReference[]) => {
      if (!text.trim() || activeChat.status === 'streaming') return;

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

      // Resolve @-mention data from Neon
      const explicitContext =
        mentions.length > 0 ? await resolveAll(mentions) : undefined;

      // Encode mentions into message text so they're visible in the conversation
      let messageText = text.trim();
      if (mentions.length > 0) {
        const mentionMeta = JSON.stringify(
          mentions.map((m) => ({
            categoryId: m.categoryId,
            itemId: m.itemId,
            label: m.label,
          })),
        );
        messageText = `<!-- mentions:${mentionMeta} -->\n${messageText}`;
      }

      activeChat.sendMessage(
        {text: messageText},
        {
          body: {
            persona: activePersona,
            model: selectedModel,
            memory,
            athleteId,
            sessionId: session?.id ?? null,
            explicitContext,
          },
        },
      );
    },
    [
      activeChat,
      activePersona,
      selectedModel,
      memory,
      activeSession,
      activeSM,
      athleteId,
      resolveAll,
    ],
  );

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

  const handleDeleteSessionRequest = useCallback((id: string) => {
    setDeleteConfirmSessionId(id);
  }, []);

  const handleDeleteSessionConfirm = useCallback(async () => {
    const id = deleteConfirmSessionId;
    if (!id) return;
    setDeleteConfirmSessionId(null);

    await activeSM.deleteSession(id);

    if (activeSM.sessions.length <= 1) {
      activeChat.setMessages([]);
      lastPersistedCount.current = 0;
      setMemory(null);
    }
  }, [deleteConfirmSessionId, activeSM, activeChat]);

  const handlePersonaSwitch = useCallback((personaId: PersonaId) => {
    setActivePersona(personaId);
    loadedSessionRef.current = null; // Force reload on persona switch
    lastPersistedCount.current = 0;
  }, []);

  const isStreaming = activeChat.status === 'streaming';
  const hasError = activeChat.error;

  // Extract follow-up suggestions from the last assistant message's tool parts
  const followUpSuggestions = useMemo(() => {
    if (isStreaming) return [];
    const messages = activeChat.messages;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant');
    if (!lastAssistant?.parts) return [];
    for (const part of lastAssistant.parts) {
      if (
        part.type === 'tool-suggestFollowUps' &&
        'state' in part &&
        (part as {state: string}).state === 'output-available' &&
        'input' in part
      ) {
        const input = (part as {input: SuggestFollowUpsInput}).input;
        return input?.suggestions ?? [];
      }
    }
    return [];
  }, [activeChat.messages, isStreaming]);

  // ----- Sidebar content (shared between desktop and mobile drawer) -----

  const renderSidebarContent = (options?: {onCollapse?: () => void}) => (
    <div className='flex flex-col h-full'>
      {/* History header */}
      <div className='px-3 py-2.5 border-b-3 border-border flex items-center justify-between bg-foreground text-background'>
        <span className='font-black text-xs uppercase tracking-widest'>
          History
        </span>
        <div className='flex items-center gap-1'>
          <button
            onClick={() => {
              handleNewConversation();
              setSidebarOpen(false);
            }}
            aria-label='New conversation'
            tabIndex={0}
            className='flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-background bg-accent text-accent-foreground transition-all shrink-0 shadow-neo-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none'
          >
            <Plus className='h-3 w-3' />
            New
          </button>
          {options?.onCollapse && (
            <button
              onClick={options.onCollapse}
              aria-label='Collapse sidebar'
              tabIndex={0}
              className='p-1 hover:bg-background/20 transition-colors'
            >
              <ChevronRight className='h-4 w-4' />
            </button>
          )}
        </div>
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
            className={`group flex items-center gap-2 px-3 py-3 text-xs border-b border-border/50 cursor-pointer transition-all ${
              session.id === activeSession?.id
                ? `${currentPersona.tintBg} font-black border-l-[4px] ${currentPersona.bubbleBorder} shadow-neo-sm`
                : 'hover:bg-muted font-medium border-l-[4px] border-l-transparent'
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
                handleDeleteSessionRequest(session.id);
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
          const sm = sessionManagers[p.id];
          const sessionCount = sm.sessions.length;
          return (
            <button
              key={p.id}
              onClick={() => {
                handlePersonaSwitch(p.id);
                setSidebarOpen(false);
              }}
              aria-label={`Switch to ${p.label}`}
              tabIndex={0}
              className={`w-full flex items-center gap-2.5 px-3 py-3 text-xs transition-all border-l-[5px] ${
                isActive
                  ? `font-black text-foreground ${p.color} border-l-border shadow-neo-sm`
                  : 'font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l-transparent hover:border-l-border/30'
              }`}
            >
              <PersonaAvatar persona={p} size='sm' />
              <span className={isActive ? 'text-foreground' : ''}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ----- Render -----

  return (
    <div className='flex h-full min-w-0 overflow-hidden'>
      {/* Chat area */}
      <div className='flex-1 flex flex-col min-w-0 overflow-hidden'>
        {/* Mobile header — persona + new chat + history */}
        <div
          className={`md:hidden px-2 py-2 border-b-3 border-border flex items-center gap-2 bg-neo-stripe ${currentPersona.color}`}
        >
          <div className='flex items-center gap-1.5 flex-1 min-w-0'>
            <PersonaAvatar persona={currentPersona} size='sm' />
            <span className='font-black text-xs truncate text-foreground'>
              {activeSession?.title ?? currentPersona.label}
            </span>
          </div>
          <button
            onClick={handleNewConversation}
            aria-label='New conversation'
            tabIndex={0}
            className='p-1.5 border-2 border-border bg-background hover:bg-muted transition-colors shrink-0 shadow-neo-sm hover:shadow-none'
          >
            <Plus className='h-4 w-4' />
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label='Open conversation history'
            tabIndex={0}
            className='p-1.5 border-2 border-border bg-background hover:bg-muted transition-colors shrink-0 shadow-neo-sm hover:shadow-none'
          >
            <Menu className='h-4 w-4' />
          </button>
        </div>

        {/* Desktop header — new chat button top-right */}
        <div
          className={`hidden md:flex items-center justify-between px-3 py-2 border-b-[5px] border-border bg-neo-stripe ${currentPersona.color}`}
        >
          <div className='flex items-center gap-1.5 min-w-0'>
            <PersonaAvatar persona={currentPersona} size='sm' />
            <span className='font-black text-xs truncate text-foreground'>
              {activeSession?.title ?? currentPersona.label}
            </span>
          </div>
          <div className='flex items-center gap-1.5'>
            <button
              onClick={handleNewConversation}
              aria-label='New conversation'
              tabIndex={0}
              className='flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-3 border-border bg-accent text-accent-foreground hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shrink-0 shadow-neo-sm'
            >
              <Plus className='h-3 w-3' />
              New
            </button>
          </div>
        </div>

        {/* Memory indicator */}
        {memory && (
          <div className='px-3 py-1.5 bg-primary/15 border-b-3 border-border flex items-center gap-1.5 text-[10px] font-black text-primary uppercase tracking-wider'>
            <MessageSquare className='h-3 w-3 shrink-0' />
            Memory active — past conversations remembered
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          className='flex-1 overflow-y-auto overflow-x-hidden p-1 md:p-3 space-y-3 md:space-y-4 bg-neo-grid'
        >
          {activeChat.messages.length === 0 && !isStreaming && (
            <div className='flex items-center justify-center h-full'>
              <div className='text-center space-y-5 p-8 max-w-sm'>
                {/* Large persona icon with bounce animation */}
                <div className='flex justify-center animate-bounce-in'>
                  <div
                    className={`w-20 h-20 ${currentPersona.color} rounded-full border-[4px] border-border flex items-center justify-center shadow-neo-lg`}
                  >
                    <currentPersona.icon className='h-10 w-10 text-foreground' />
                  </div>
                </div>
                {/* Persona name */}
                <p
                  className={`font-black text-2xl md:text-3xl uppercase tracking-widest ${currentPersona.labelColor}`}
                >
                  {currentPersona.label}
                </p>
                {/* Description in a card */}
                <div
                  className={`border-3 border-border p-3 shadow-neo-sm ${currentPersona.tintBg}`}
                >
                  <p className='text-sm font-bold text-muted-foreground'>
                    {activePersona === 'coach' &&
                      'Ask about training plans, workouts, and race strategy'}
                    {activePersona === 'nutritionist' &&
                      'Ask about fueling, hydration, and recovery nutrition'}
                    {activePersona === 'physio' &&
                      'Ask about injury prevention, mobility, and recovery'}
                  </p>
                </div>
                {/* Quick-start suggestion buttons */}
                <div className='flex flex-wrap justify-center gap-2 pt-1'>
                  {PERSONA_STARTERS[activePersona].map((starter, idx) => (
                    <button
                      key={starter}
                      onClick={() => handleSend(starter, [])}
                      tabIndex={0}
                      aria-label={`Ask: ${starter}`}
                      className={`animate-fade-in-up px-3 py-1.5 text-xs font-black border-3 border-border shadow-neo-sm transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none active:translate-x-1 active:translate-y-1 cursor-pointer ${currentPersona.tintBg} ${currentPersona.labelColor}`}
                      style={{animationDelay: `${idx * 100}ms`}}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeChat.messages.map((msg, msgIdx) => {
            const isUser = msg.role === 'user';
            const prevRole =
              msgIdx > 0 ? activeChat.messages[msgIdx - 1]?.role : null;
            const isRoleSwitch = prevRole !== null && prevRole !== msg.role;

            // Skip suggestFollowUps tool parts — rendered separately as chips
            const hasSuggestionTool =
              msg.parts?.some(
                (part) => part.type === 'tool-suggestFollowUps',
              ) ?? false;

            // Collect text content, stripping trailing bracketed suggestions
            // when the model duplicates them alongside a suggestFollowUps tool call
            let textContent =
              msg.parts
                ?.filter(
                  (part): part is {type: 'text'; text: string} =>
                    part.type === 'text',
                )
                .map((part) => part.text)
                .join('') ?? '';
            if (hasSuggestionTool && textContent) {
              textContent = textContent.replace(/(\s*\[[^\]]+\])+\s*$/, '').trim();
            }
            // Strip leaked tool-call artifacts like "functions.suggestFollowUps" (+ trailing garble)
            textContent = textContent.replace(/functions\.\w+\S*/g, '').trim();

            // Collect ALL tool parts for status chips (any part whose type starts with 'tool-')
            const allToolChipParts = (msg.parts ?? [])
              .filter(
                (part) => part.type.startsWith('tool-') && 'state' in part,
              )
              .map((part) => {
                const toolName = part.type.replace(/^tool-/, '');
                const state = (part as unknown as {state: string}).state;
                return {
                  toolName,
                  label: TOOL_LABELS[toolName] ?? toolName,
                  done: state === 'output-available',
                };
              });

            // Skip if no content at all (suggestFollowUps-only messages are hidden)
            if (
              !textContent &&
              !hasSuggestionTool &&
              allToolChipParts.length === 0
            )
              return null;
            // If the only parts are suggestFollowUps with no text or other tools, skip the bubble
            if (
              !textContent &&
              hasSuggestionTool &&
              allToolChipParts.length <= 1
            )
              return null;

            return (
              <div
                key={msg.id}
                className={`flex gap-2 min-w-0 ${isUser ? 'flex-row-reverse animate-slide-in-right' : 'flex-row animate-slide-in-left'} ${isRoleSwitch ? 'mt-4' : ''}`}
              >
                <div
                  className={`text-sm font-medium overflow-hidden break-words min-w-0 ${
                    isUser
                      ? 'p-2 md:p-3 border-3 border-border bg-accent text-accent-foreground ml-auto max-w-[90%] md:max-w-[75%] shadow-neo-sm hover:shadow-neo transition-shadow'
                      : 'py-1 mr-auto max-w-[95%] md:max-w-[80%] text-foreground'
                  }`}
                  style={{overflowWrap: 'anywhere'}}
                >
                  {!isUser && (
                    <span
                      className={`font-black text-xs uppercase mb-1 flex items-center gap-1.5 ${currentPersona.labelColor}`}
                    >
                      <span
                        className={`w-1.5 h-1.5 ${currentPersona.color} border border-border shrink-0`}
                      />
                      {currentPersona.label}
                    </span>
                  )}
                  {isUser ? (
                    (() => {
                      const {mentions: msgMentions, cleanText} =
                        parseMentionMeta(textContent);
                      return (
                        <>
                          {msgMentions.length > 0 && (
                            <div className='flex flex-wrap gap-1 mb-1.5'>
                              {msgMentions.map((mention, idx) => {
                                const cat = getMentionCategory(
                                  mention.categoryId,
                                );
                                const Icon = cat?.icon;
                                return (
                                  <span
                                    key={`${mention.categoryId}-${mention.itemId ?? 'all'}-${idx}`}
                                    className='inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-primary/10 border-2 border-primary/30 text-primary rounded-sm'
                                  >
                                    {Icon && <Icon className='h-2.5 w-2.5' />}
                                    {mention.label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {cleanText}
                        </>
                      );
                    })()
                  ) : (
                    <>
                      {/* Tool call status chips — collapsible when all done */}
                      {allToolChipParts.length > 0 && (
                        <ToolCallGroup chips={allToolChipParts} />
                      )}
                      {textContent && (
                        <div className='prose prose-sm dark:prose-invert overflow-hidden max-w-full prose-p:mb-2 prose-p:last:mb-0'>
                          <MarkdownContent content={textContent} />
                          {/* Blinking block cursor while streaming */}
                          {isStreaming &&
                            msgIdx === activeChat.messages.length - 1 &&
                            msg.role === 'assistant' && (
                              <span className='inline-block w-2 h-4 bg-primary animate-neo-blink ml-0.5 align-middle' />
                            )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Streaming indicator — "Thinking" state before first AI token */}
          {isStreaming &&
            activeChat.messages.length > 0 &&
            activeChat.messages[activeChat.messages.length - 1]?.role ===
              'user' && (
              <StreamingIndicator
                label={currentPersona.label}
                icon={currentPersona.icon}
                color={currentPersona.color}
                bubbleBorder={currentPersona.bubbleBorder}
                labelColor={currentPersona.labelColor}
              />
            )}

          {/* Follow-up suggestion chips — inside scroll area, after last message */}
          {followUpSuggestions.length > 0 && !isStreaming && (
            <SuggestionChips
              suggestions={followUpSuggestions}
              onSelect={(text) => handleSend(text, [])}
            />
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

        {/* Input with @-mention support */}
        <ChatInput
          onSend={handleSend}
          onStop={activeChat.stop}
          isStreaming={isStreaming}
        />
      </div>

      {/* Desktop history sidebar (right) — collapsible, default closed */}
      <div
        className={`hidden md:flex flex-col border-l-3 border-border bg-muted/30 shrink-0 overflow-hidden transition-all duration-200 ${desktopSidebarExpanded ? 'w-[280px]' : 'w-[52px]'}`}
      >
        {desktopSidebarExpanded ? (
          renderSidebarContent({
            onCollapse: () => setDesktopSidebarExpanded(false),
          })
        ) : (
          <div className='flex flex-col h-full items-center'>
            {/* History icon — expand sidebar */}
            <button
              onClick={() => setDesktopSidebarExpanded(true)}
              aria-label='Open conversation history'
              tabIndex={0}
              className='w-full py-3 flex justify-center border-b-3 border-border bg-foreground text-background hover:bg-foreground/90 transition-colors'
            >
              <MessageSquare className='h-5 w-5' />
            </button>
            {/* Spacer */}
            <div className='flex-1' />
            {/* Persona icons */}
            <div className='border-t-3 border-border w-full bg-background'>
              {personas.map((p) => {
                const isActive = activePersona === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePersonaSwitch(p.id)}
                    aria-label={`Switch to ${p.label}`}
                    tabIndex={0}
                    className={`w-full flex justify-center py-3 transition-all ${isActive ? `${p.color} shadow-neo-sm` : 'hover:bg-muted/50'}`}
                  >
                    <PersonaAvatar persona={p} size='sm' />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Mobile history drawer (right) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side='right'
          className='p-0 w-[280px] sm:max-w-[280px]'
          aria-describedby={undefined}
        >
          <SheetTitle className='sr-only'>Conversation History</SheetTitle>
          {renderSidebarContent()}
        </SheetContent>
      </Sheet>

      {/* Delete conversation confirmation dialog */}
      <AlertDialog
        open={!!deleteConfirmSessionId}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmSessionId(null);
        }}
      >
        <AlertDialogContent className='border-3 border-border max-w-[280px] p-4 gap-3'>
          <AlertDialogHeader>
            <AlertDialogTitle className='font-black text-base'>
              Delete conversation?
            </AlertDialogTitle>
            <AlertDialogDescription className='text-sm text-muted-foreground space-y-2'>
              <span className='block'>
                This will permanently delete this conversation and all
                associated data:
              </span>
              <span className='block space-y-1 text-xs'>
                <span className='flex items-center gap-1.5'>
                  <MessageSquare className='h-3 w-3 shrink-0' />
                  All messages in this conversation
                </span>
                <span className='flex items-center gap-1.5'>
                  <MessageSquare className='h-3 w-3 shrink-0' />
                  Memory &amp; conversation summary
                </span>
              </span>
              <span className='block font-bold text-foreground text-xs'>
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className='border-2 border-border font-bold text-xs'>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSessionConfirm}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90 border-2 border-border font-black text-xs'
            >
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AITeamChat;

'use client';

import {useState, useRef, useEffect, useMemo, useCallback} from 'react';
import {
  Dumbbell,
  Apple,
  Stethoscope,
  Loader2,
  Plus,
  MessageSquare,
  Trash2,
  Menu,
  ChevronDown,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  ClipboardList,
  Target,
  AlertOctagon,
  ArrowRightLeft,
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
import {DEFAULT_MODEL} from '@/lib/activityModel';
import type {PersonaId} from '@/lib/aiPrompts';
import type {
  CachedChatMessageFeedback,
  ChatFeedbackRating,
  ChatFeedbackReason,
  CachedTrainingFeedback,
  CachedOrchestratorGoal,
  CachedOrchestratorPlanItem,
  CachedOrchestratorBlocker,
  CachedOrchestratorHandoff,
  CachedWeeklyPlan,
  CachedTrainingBlock,
} from '@/lib/cacheTypes';
import {
  getMentionCategory,
  parseMentionMeta,
  type MentionReference,
} from '@/lib/mentionTypes';
import {
  neonGetChatMessageFeedback,
  neonSyncChatMessageFeedback,
  neonSyncTrainingFeedback,
  neonGetOrchestratorGoals,
  neonGetOrchestratorPlanItems,
  neonGetOrchestratorBlockers,
  neonGetOrchestratorHandoffs,
  neonGetActiveWeeklyPlan,
  neonGetActiveTrainingBlock,
} from '@/lib/chatSync';
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
import {parseAiErrorFromUnknown} from '@/lib/aiErrors';
import WeeklyReflectionForm from '@/components/feedback/WeeklyReflectionForm';
import AiErrorBanner from '@/components/ai/AiErrorBanner';
import AiGenerationStatusCard from '@/components/ai/AiGenerationStatusCard';
import {
  parseSseChunks,
  type AiProgressEvent,
  type AiProgressPhase,
} from '@/lib/aiProgress';

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
  {
    id: 'orchestrator',
    label: 'Orchestrator',
    icon: ClipboardList,
    color: 'bg-primary',
    bubbleBorder: 'border-l-primary',
    labelColor: 'text-primary',
    tintBg: 'bg-primary/10',
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
  orchestrator: [
    'Set my weekly goals',
    'What is still blocked?',
    'Create handoffs for the team',
  ],
};

type NegativeFeedbackReason = Exclude<ChatFeedbackReason, 'helpful'>;

const NEGATIVE_FEEDBACK_OPTIONS: Array<{
  id: NegativeFeedbackReason;
  label: string;
}> = [
  {id: 'unsafe', label: 'Unsafe'},
  {id: 'too_generic', label: 'Too generic'},
  {id: 'not_actionable', label: 'Not actionable'},
  {id: 'wrong_context', label: 'Wrong context'},
  {id: 'other', label: 'Other'},
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
  getTrainingFeedback: 'Loading your training feedback',
  requestTrainingFeedback: 'Preparing weekly reflection',
  saveTrainingFeedback: 'Saving training feedback',
  // Action tools
  suggestFollowUps: 'Preparing suggestions',
};

const WEEKLY_PLAN_PROGRESS_PHASE_ORDER: AiProgressPhase[] = [
  'context',
  'coach',
  'physio',
  'repair',
  'merge',
  'save',
];

const WEEKLY_PLAN_PROGRESS_PHASE_LABELS: Record<AiProgressPhase, string> = {
  context: 'Load context',
  coach: 'Coach draft',
  physio: 'Physio draft',
  repair: 'Conflict check and repair',
  merge: 'Merge sessions',
  save: 'Persist plan',
  done: 'Complete',
  error: 'Error',
};

const createInitialPhaseStatusMap = (): Record<
  AiProgressPhase,
  'pending' | 'in_progress' | 'done' | 'error'
> => ({
  context: 'pending',
  coach: 'pending',
  physio: 'pending',
  repair: 'pending',
  merge: 'pending',
  save: 'pending',
  done: 'pending',
  error: 'pending',
});

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
  const [mobileOrchestratorExpanded, setMobileOrchestratorExpanded] = useState(false);
  const [desktopOrchestratorExpanded, setDesktopOrchestratorExpanded] = useState(false);
  const [deleteConfirmSessionId, setDeleteConfirmSessionId] = useState<
    string | null
  >(null);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<
    Record<string, CachedChatMessageFeedback>
  >({});
  const [orchestratorGoals, setOrchestratorGoals] = useState<
    CachedOrchestratorGoal[]
  >([]);
  const [orchestratorPlanItems, setOrchestratorPlanItems] = useState<
    CachedOrchestratorPlanItem[]
  >([]);
  const [orchestratorBlockers, setOrchestratorBlockers] = useState<
    CachedOrchestratorBlocker[]
  >([]);
  const [orchestratorHandoffs, setOrchestratorHandoffs] = useState<
    CachedOrchestratorHandoff[]
  >([]);
  const [activeWeeklyPlan, setActiveWeeklyPlan] = useState<CachedWeeklyPlan | null>(
    null,
  );
  const [activeTrainingBlock, setActiveTrainingBlock] =
    useState<CachedTrainingBlock | null>(null);
  const [savedTrainingFeedbackByWeek, setSavedTrainingFeedbackByWeek] = useState<
    Record<string, CachedTrainingFeedback>
  >({});
  const [submittingTrainingFeedbackWeek, setSubmittingTrainingFeedbackWeek] =
    useState<string | null>(null);
  const [negativeFeedbackDrafts, setNegativeFeedbackDrafts] = useState<
    Record<string, {reason: NegativeFeedbackReason; freeText: string; open: boolean}>
  >({});
  const [isWeeklyPlanGenerating, setIsWeeklyPlanGenerating] = useState(false);
  const [weeklyPlanProgress, setWeeklyPlanProgress] = useState<AiProgressEvent[]>(
    [],
  );
  const [weeklyPlanCurrentMessage, setWeeklyPlanCurrentMessage] =
    useState<string | null>(null);
  const [weeklyPlanPhaseStatusMap, setWeeklyPlanPhaseStatusMap] = useState<
    Record<AiProgressPhase, 'pending' | 'in_progress' | 'done' | 'error'>
  >(createInitialPhaseStatusMap());
  const [weeklyPlanGenerationError, setWeeklyPlanGenerationError] = useState<
    ReturnType<typeof parseAiErrorFromUnknown> | null
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
  const orchestratorSessions = useChatSessions(athleteId, 'orchestrator');

  const sessionManagers = useMemo(
    () => ({
      coach: coachSessions,
      nutritionist: nutritionistSessions,
      physio: physioSessions,
      orchestrator: orchestratorSessions,
    }),
    [coachSessions, nutritionistSessions, physioSessions, orchestratorSessions],
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

  useEffect(() => {
    const sid = activeSession?.id;
    if (!sid) {
      setFeedbackByMessageId({});
      return;
    }
    (async () => {
      const feedback = await neonGetChatMessageFeedback(sid);
      if (!feedback) {
        setFeedbackByMessageId({});
        return;
      }
      const map = feedback.reduce<Record<string, CachedChatMessageFeedback>>(
        (acc, item) => {
          acc[item.messageId] = item;
          return acc;
        },
        {},
      );
      setFeedbackByMessageId(map);
    })();
  }, [activeSession?.id]);

  const refreshOrchestratorSnapshot = useCallback(async () => {
    if (!activeSession?.id || !athleteId) return;
    const [goals, planItems, blockers, handoffs, weeklyPlan, trainingBlock] =
      await Promise.all([
        neonGetOrchestratorGoals(athleteId, activeSession.id),
        neonGetOrchestratorPlanItems(athleteId, activeSession.id),
        neonGetOrchestratorBlockers(athleteId, activeSession.id),
        neonGetOrchestratorHandoffs(athleteId, activeSession.id),
        neonGetActiveWeeklyPlan(athleteId),
        neonGetActiveTrainingBlock(athleteId),
      ]);
    setOrchestratorGoals(goals ?? []);
    setOrchestratorPlanItems(planItems ?? []);
    setOrchestratorBlockers(blockers ?? []);
    setOrchestratorHandoffs(handoffs ?? []);
    setActiveWeeklyPlan(weeklyPlan ?? null);
    setActiveTrainingBlock(trainingBlock ?? null);
  }, [activeSession?.id, athleteId]);

  useEffect(() => {
    if (activePersona !== 'orchestrator' || !activeSession?.id || !athleteId) {
      setOrchestratorGoals([]);
      setOrchestratorPlanItems([]);
      setOrchestratorBlockers([]);
      setOrchestratorHandoffs([]);
      setActiveWeeklyPlan(null);
      setActiveTrainingBlock(null);
      return;
    }
    refreshOrchestratorSnapshot();
  }, [
    activePersona,
    activeSession?.id,
    athleteId,
    activeChat.messages.length,
    refreshOrchestratorSnapshot,
  ]);

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
  const parsedChatError = useMemo(() => {
    if (!activeChat.error) return null;
    const rawMessage = activeChat.error.message;
    if (!rawMessage) {
      return parseAiErrorFromUnknown(null);
    }
    try {
      return parseAiErrorFromUnknown(JSON.parse(rawMessage), rawMessage);
    } catch {
      return parseAiErrorFromUnknown({error: rawMessage}, rawMessage);
    }
  }, [activeChat.error]);

  const persistMessageFeedback = useCallback(
    async (
      messageId: string,
      rating: ChatFeedbackRating,
      reason: ChatFeedbackReason | null,
      freeText: string | null,
    ) => {
      if (!activeSession?.id || !athleteId) return;
      const now = Date.now();
      const record: CachedChatMessageFeedback = {
        id: `${activeSession.id}:${messageId}`,
        athleteId,
        sessionId: activeSession.id,
        messageId,
        persona: activePersona,
        route: 'ai.chat',
        model: selectedModel ?? null,
        traceId: null,
        rating,
        reason,
        freeText,
        createdAt: now,
        updatedAt: now,
      };
      await neonSyncChatMessageFeedback(record);
      setFeedbackByMessageId((prev) => ({...prev, [messageId]: record}));
    },
    [activeSession?.id, activePersona, athleteId, selectedModel],
  );

  const handleMessageFeedback = useCallback(
    async (messageId: string, rating: ChatFeedbackRating) => {
      if (rating === 'helpful') {
        await persistMessageFeedback(messageId, 'helpful', 'helpful', null);
        setNegativeFeedbackDrafts((prev) => {
          const next = {...prev};
          delete next[messageId];
          return next;
        });
        return;
      }

      const existing = feedbackByMessageId[messageId];
      const existingReason: NegativeFeedbackReason =
        existing?.rating === 'not_helpful' && existing.reason && existing.reason !== 'helpful'
          ? (existing.reason as NegativeFeedbackReason)
          : 'too_generic';
      setNegativeFeedbackDrafts((prev) => ({
        ...prev,
        [messageId]: {
          reason: prev[messageId]?.reason ?? existingReason,
          freeText: prev[messageId]?.freeText ?? existing?.freeText ?? '',
          open: !prev[messageId]?.open,
        },
      }));
    },
    [feedbackByMessageId, persistMessageFeedback],
  );

  const handleSubmitNegativeFeedback = useCallback(
    async (messageId: string) => {
      const draft = negativeFeedbackDrafts[messageId];
      if (!draft) return;
      await persistMessageFeedback(
        messageId,
        'not_helpful',
        draft.reason,
        draft.reason === 'other' ? (draft.freeText.trim() || null) : null,
      );
      setNegativeFeedbackDrafts((prev) => ({
        ...prev,
        [messageId]: {...draft, open: false},
      }));
    },
    [negativeFeedbackDrafts, persistMessageFeedback],
  );

  const handleSubmitTrainingFeedback = useCallback(
    async (
      weekStart: string,
      values: {
        adherence: number;
        effort: number;
        fatigue: number;
        soreness: number;
        mood: number;
        confidence: number;
        notes?: string;
      },
    ) => {
      if (!athleteId || !weekStart) return;
      setSubmittingTrainingFeedbackWeek(weekStart);
      try {
        const now = Date.now();
        const existing = savedTrainingFeedbackByWeek[weekStart];
        const record: CachedTrainingFeedback = {
          id: `${athleteId}:${weekStart}`,
          athleteId,
          weekStart,
          adherence: values.adherence,
          effort: values.effort,
          fatigue: values.fatigue,
          soreness: values.soreness,
          mood: values.mood,
          confidence: values.confidence,
          notes: values.notes?.trim() ? values.notes.trim() : null,
          source: 'coach_chat',
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        await neonSyncTrainingFeedback(record);
        setSavedTrainingFeedbackByWeek((prev) => ({...prev, [weekStart]: record}));
      } finally {
        setSubmittingTrainingFeedbackWeek(null);
      }
    },
    [athleteId, savedTrainingFeedbackByWeek],
  );

  const handleGenerateWeeklyPlanFromOrchestrator = useCallback(async () => {
    if (!athleteId || !activeSession?.id || isWeeklyPlanGenerating) return;

    setIsWeeklyPlanGenerating(true);
    setWeeklyPlanProgress([]);
    setWeeklyPlanCurrentMessage('Starting weekly plan generation...');
    setWeeklyPlanPhaseStatusMap(createInitialPhaseStatusMap());
    setWeeklyPlanGenerationError(null);

    const payload = {
      athleteId,
      model: selectedModel,
      orchestratorSessionId: activeSession.id,
    };

    try {
      const response = await fetch('/api/ai/weekly-plan', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        setWeeklyPlanGenerationError(
          parseAiErrorFromUnknown(body, 'Failed to generate weekly plan from orchestrator'),
        );
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setWeeklyPlanGenerationError(
          parseAiErrorFromUnknown(
            null,
            'Missing response stream while generating weekly plan',
          ),
        );
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let latestPhase: AiProgressPhase | null = null;
      let streamErrored = false;
      let completed = false;

      const markPhaseInProgress = (phase: AiProgressPhase) => {
        if (!WEEKLY_PLAN_PROGRESS_PHASE_ORDER.includes(phase)) return;
        setWeeklyPlanPhaseStatusMap((prev) => {
          const next = {...prev};
          if (
            latestPhase &&
            latestPhase !== phase &&
            next[latestPhase] === 'in_progress'
          ) {
            next[latestPhase] = 'done';
          }
          next[phase] = 'in_progress';
          return next;
        });
        latestPhase = phase;
      };

      const markTerminalState = (state: 'done' | 'error') => {
        setWeeklyPlanPhaseStatusMap((prev) => {
          const next = {...prev};
          if (latestPhase && next[latestPhase] === 'in_progress') {
            next[latestPhase] = state;
          }
          next[state === 'done' ? 'done' : 'error'] = state;
          return next;
        });
      };

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const parsed = parseSseChunks<AiProgressEvent>(buffer, '');
        buffer = parsed.remainder;

        for (const event of parsed.events) {
          setWeeklyPlanProgress((prev) => [...prev, event]);
          setWeeklyPlanCurrentMessage(event.message);

          if (event.type === 'progress') {
            markPhaseInProgress(event.phase);
            continue;
          }

          if (event.type === 'error') {
            markTerminalState('error');
            const meta = (event.meta as {code?: string} | undefined) ?? undefined;
            setWeeklyPlanGenerationError(
              parseAiErrorFromUnknown(
                {code: meta?.code, error: event.message},
                event.message,
              ),
            );
            streamErrored = true;
            break;
          }

          if (event.type === 'done') {
            markTerminalState('done');
            completed = true;
            break;
          }
        }

        if (streamErrored || completed) break;
      }

      if (completed) {
        await refreshOrchestratorSnapshot();
      }
    } catch (error) {
      setWeeklyPlanGenerationError(
        parseAiErrorFromUnknown(error, 'Failed to generate weekly plan from orchestrator'),
      );
      setWeeklyPlanPhaseStatusMap((prev) => ({
        ...prev,
        error: 'error',
      }));
    } finally {
      setIsWeeklyPlanGenerating(false);
    }
  }, [
    athleteId,
    activeSession?.id,
    isWeeklyPlanGenerating,
    selectedModel,
    refreshOrchestratorSnapshot,
  ]);

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

  const orchestratorNotDoneQueue = useMemo(
    () => orchestratorPlanItems.filter((item) => item.status !== 'done'),
    [orchestratorPlanItems],
  );
  const activeGoalCount = useMemo(
    () => orchestratorGoals.filter((goal) => goal.status === 'active').length,
    [orchestratorGoals],
  );
  const openBlockerCount = useMemo(
    () => orchestratorBlockers.filter((blocker) => blocker.status === 'open').length,
    [orchestratorBlockers],
  );
  const pendingHandoffCount = useMemo(
    () =>
      orchestratorHandoffs.filter(
        (handoff) => handoff.status !== 'done' && handoff.status !== 'cancelled',
      ).length,
    [orchestratorHandoffs],
  );
  const recentCoordinationItems = useMemo(
    () =>
      orchestratorPlanItems
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3)
        .map((item) => {
          let coordinationSummary: string | null = null;
          if (item.detail) {
            try {
              const parsed = JSON.parse(item.detail) as {summary?: string; conflictSummary?: string};
              coordinationSummary = parsed.summary ?? parsed.conflictSummary ?? null;
            } catch {
              coordinationSummary = null;
            }
          }
          return {
            id: item.id,
            title: item.title,
            status: item.status,
            ownerPersona: item.ownerPersona ?? 'unassigned',
            summary: coordinationSummary,
          };
        }),
    [orchestratorPlanItems],
  );

  useEffect(() => {
    if (activePersona !== 'orchestrator') {
      setMobileOrchestratorExpanded(false);
      setDesktopOrchestratorExpanded(false);
    }
  }, [activePersona]);

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

  const renderOrchestratorDetails = ({denseMobile = false}: {denseMobile?: boolean}) => (
    <div className='space-y-2'>
      <div className='border-2 border-border p-2 bg-background space-y-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-[10px] font-black uppercase tracking-widest text-primary'>
            Weekly plan pipeline
          </p>
          <button
            onClick={handleGenerateWeeklyPlanFromOrchestrator}
            disabled={isWeeklyPlanGenerating || !athleteId || !activeSession?.id}
            tabIndex={0}
            aria-label='Generate weekly plan from orchestrator'
            className='inline-flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-primary text-primary-foreground disabled:opacity-50 disabled:pointer-events-none'
          >
            {isWeeklyPlanGenerating ? (
              <Loader2 className='h-3 w-3 animate-spin' />
            ) : (
              <ClipboardList className='h-3 w-3' />
            )}
            Generate plan
          </button>
        </div>
        {(isWeeklyPlanGenerating || weeklyPlanProgress.length > 0) && (
          <AiGenerationStatusCard
            title='Pipeline status'
            subtitle='Live coach and physio coordination progress.'
            phaseOrder={WEEKLY_PLAN_PROGRESS_PHASE_ORDER}
            phaseLabels={WEEKLY_PLAN_PROGRESS_PHASE_LABELS}
            phaseStatusMap={weeklyPlanPhaseStatusMap}
            currentMessage={weeklyPlanCurrentMessage}
          />
        )}
        {weeklyPlanGenerationError && (
          <AiErrorBanner error={weeklyPlanGenerationError} className='text-xs' />
        )}
      </div>
      <div
        className={`grid ${denseMobile ? 'grid-cols-2 gap-1.5' : 'grid-cols-1 md:grid-cols-2 gap-2'}`}
      >
        <div className='border-2 border-border p-2 bg-primary/5'>
          <div className='flex items-center gap-1.5 mb-1'>
            <Target className='h-3.5 w-3.5 text-primary' />
            <span className='text-[10px] font-black uppercase tracking-widest text-primary'>
              Goals
            </span>
          </div>
          <p className='text-xs font-medium'>
            {activeGoalCount} active / {orchestratorGoals.length} total
          </p>
        </div>
        <div className='border-2 border-border p-2 bg-secondary/5'>
          <div className='flex items-center gap-1.5 mb-1'>
            <ClipboardList className='h-3.5 w-3.5 text-secondary' />
            <span className='text-[10px] font-black uppercase tracking-widest text-secondary'>
              Not Done Queue
            </span>
          </div>
          <p className='text-xs font-medium'>
            {orchestratorNotDoneQueue.length} remaining items
          </p>
        </div>
        <div className='border-2 border-border p-2 bg-destructive/5'>
          <div className='flex items-center gap-1.5 mb-1'>
            <AlertOctagon className='h-3.5 w-3.5 text-destructive' />
            <span className='text-[10px] font-black uppercase tracking-widest text-destructive'>
              Blockers
            </span>
          </div>
          <p className='text-xs font-medium'>
            {openBlockerCount} open / {orchestratorBlockers.length} total
          </p>
        </div>
        <div className='border-2 border-border p-2 bg-accent/30'>
          <div className='flex items-center gap-1.5 mb-1'>
            <ArrowRightLeft className='h-3.5 w-3.5 text-foreground' />
            <span className='text-[10px] font-black uppercase tracking-widest'>
              Handoffs
            </span>
          </div>
          <p className='text-xs font-medium'>
            {pendingHandoffCount} pending / {orchestratorHandoffs.length} total
          </p>
        </div>
      </div>
      <div
        className={`grid ${denseMobile ? 'grid-cols-1 gap-1.5' : 'grid-cols-1 md:grid-cols-2 gap-2'}`}
      >
        <div className='border-2 border-border p-2 bg-background'>
          <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1'>
            Active Weekly Plan
          </p>
          <p className='text-xs font-medium truncate'>
            {activeWeeklyPlan
              ? `${activeWeeklyPlan.title} (${activeWeeklyPlan.weekStart})`
              : 'None'}
          </p>
        </div>
        <div className='border-2 border-border p-2 bg-background'>
          <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1'>
            Active Training Block
          </p>
          <p className='text-xs font-medium truncate'>
            {activeTrainingBlock
              ? `${activeTrainingBlock.goalEvent} (${activeTrainingBlock.totalWeeks}w)`
              : 'None'}
          </p>
        </div>
      </div>
      <div className='border-2 border-border p-2 bg-background'>
        <p className='text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5'>
          Coordination timeline
        </p>
        {recentCoordinationItems.length === 0 ? (
          <p className='text-xs text-muted-foreground font-medium'>
            No coordination events yet.
          </p>
        ) : (
          <div className='space-y-1.5'>
            {recentCoordinationItems.map((item) => (
              <div key={item.id} className='border border-border/70 bg-muted/30 px-2 py-1.5'>
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-xs font-bold truncate'>{item.title}</span>
                  <span className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>
                    {item.ownerPersona} · {item.status}
                  </span>
                </div>
                {item.summary && (
                  <p className='text-[11px] text-muted-foreground mt-1'>{item.summary}</p>
                )}
              </div>
            ))}
          </div>
        )}
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
          className={`md:hidden px-2 py-1.5 border-b-3 border-border flex items-center gap-1.5 bg-neo-stripe ${currentPersona.color}`}
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

        <div className='md:hidden border-b-2 border-border bg-background p-1.5 grid grid-cols-4 gap-1'>
          {personas.map((persona) => {
            const active = activePersona === persona.id;
            return (
              <button
                key={persona.id}
                onClick={() => handlePersonaSwitch(persona.id)}
                tabIndex={0}
                aria-label={`Switch to ${persona.label}`}
                className={`px-1.5 py-1.5 text-[10px] font-black uppercase tracking-wider border-2 border-border ${
                  active ? `${persona.tintBg} ${persona.labelColor}` : 'bg-background text-muted-foreground'
                }`}
              >
                {persona.label}
              </button>
            );
          })}
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

        {activePersona === 'orchestrator' && (
          <>
            {/* Mobile: compact summary, collapsed by default */}
            <div className='md:hidden border-b-3 border-border bg-background p-2'>
              <button
                onClick={() =>
                  setMobileOrchestratorExpanded((prevExpanded) => !prevExpanded)
                }
                aria-label='Toggle orchestrator status summary'
                aria-expanded={mobileOrchestratorExpanded}
                tabIndex={0}
                className='w-full border-2 border-border bg-primary/5 px-2 py-1.5 text-left'
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-[10px] font-black uppercase tracking-widest text-primary'>
                    Orchestrator status
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      mobileOrchestratorExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>
                <div className='mt-1.5 grid grid-cols-3 gap-1 text-[10px] font-bold'>
                  <span className='border border-border/60 bg-background px-1.5 py-1'>
                    Goals {activeGoalCount}
                  </span>
                  <span className='border border-border/60 bg-background px-1.5 py-1'>
                    Queue {orchestratorNotDoneQueue.length}
                  </span>
                  <span className='border border-border/60 bg-background px-1.5 py-1'>
                    Blockers {openBlockerCount}
                  </span>
                </div>
              </button>
              {mobileOrchestratorExpanded && (
                <div className='pt-2'>{renderOrchestratorDetails({denseMobile: true})}</div>
              )}
            </div>

            {/* Desktop: compact summary, collapsed by default */}
            <div className='hidden md:block border-b-3 border-border bg-background p-3'>
              <button
                onClick={() =>
                  setDesktopOrchestratorExpanded((prevExpanded) => !prevExpanded)
                }
                aria-label='Toggle orchestrator status summary'
                aria-expanded={desktopOrchestratorExpanded}
                tabIndex={0}
                className='w-full border-2 border-border bg-primary/5 px-3 py-2 text-left'
              >
                <div className='flex items-center justify-between gap-2'>
                  <span className='text-[10px] font-black uppercase tracking-widest text-primary'>
                    Orchestrator status
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      desktopOrchestratorExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>
                <div className='mt-2 grid grid-cols-4 gap-1.5 text-[10px] font-bold'>
                  <span className='border border-border/60 bg-background px-2 py-1'>
                    Goals {activeGoalCount}
                  </span>
                  <span className='border border-border/60 bg-background px-2 py-1'>
                    Queue {orchestratorNotDoneQueue.length}
                  </span>
                  <span className='border border-border/60 bg-background px-2 py-1'>
                    Blockers {openBlockerCount}
                  </span>
                  <span className='border border-border/60 bg-background px-2 py-1'>
                    Handoffs {pendingHandoffCount}
                  </span>
                </div>
              </button>
              {desktopOrchestratorExpanded && (
                <div className='pt-3'>{renderOrchestratorDetails({denseMobile: false})}</div>
              )}
            </div>
          </>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          className='flex-1 overflow-y-auto overflow-x-hidden p-1.5 md:p-3 space-y-2.5 md:space-y-4 bg-neo-grid'
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
                    {activePersona === 'orchestrator' &&
                      'Coordinate goals, plan queue, blockers, and specialist handoffs'}
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
            const messageFeedback = feedbackByMessageId[msg.id];
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

            const trainingFeedbackRequestPart = (msg.parts ?? []).find(
              (part) =>
                part.type === 'tool-requestTrainingFeedback' &&
                'state' in part &&
                (part as {state: string}).state === 'output-available',
            ) as
              | {
                  input?: {weekStart?: string; prompt?: string};
                  output?: {weekStart?: string; prompt?: string};
                }
              | undefined;
            const requestedWeekStart =
              trainingFeedbackRequestPart?.output?.weekStart ??
              trainingFeedbackRequestPart?.input?.weekStart ??
              null;
            const trainingFeedbackPrompt =
              trainingFeedbackRequestPart?.output?.prompt ??
              trainingFeedbackRequestPart?.input?.prompt ??
              'Share how your training week felt.';
            const savedTrainingFeedback = requestedWeekStart
              ? savedTrainingFeedbackByWeek[requestedWeekStart]
              : null;

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
                className={`flex gap-2.5 min-w-0 ${isUser ? 'flex-row-reverse animate-slide-in-right' : 'flex-row animate-slide-in-left'} ${isRoleSwitch ? 'mt-5 md:mt-4' : ''}`}
              >
                <div
                  className={`text-[13px] md:text-sm font-medium overflow-hidden break-words min-w-0 ${
                    isUser
                      ? 'p-2.5 md:p-3 border-3 border-border bg-accent text-accent-foreground ml-auto max-w-[94%] md:max-w-[75%] shadow-neo-sm hover:shadow-neo transition-shadow'
                      : 'py-1 mr-auto max-w-[98%] md:max-w-[80%] text-foreground'
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
                      {requestedWeekStart && (
                        <div className='mt-2'>
                          <WeeklyReflectionForm
                            weekStart={requestedWeekStart}
                            prompt={trainingFeedbackPrompt}
                            initialValues={savedTrainingFeedback}
                            compact
                            isSubmitting={
                              submittingTrainingFeedbackWeek === requestedWeekStart
                            }
                            submitLabel={
                              savedTrainingFeedback
                                ? 'Update reflection'
                                : 'Submit reflection'
                            }
                            onSubmit={(values) =>
                              handleSubmitTrainingFeedback(requestedWeekStart, values)
                            }
                          />
                        </div>
                      )}
                      {!isUser && textContent && (
                        <>
                          <div className='flex items-center gap-1.5 mt-2'>
                            <button
                              onClick={() => handleMessageFeedback(msg.id, 'helpful')}
                              aria-label='Mark response helpful'
                              tabIndex={0}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold border-2 transition-colors ${
                                messageFeedback?.rating === 'helpful'
                                  ? 'bg-secondary/20 text-secondary border-secondary/40'
                                  : 'bg-background text-muted-foreground border-border hover:text-foreground'
                              }`}
                            >
                              <ThumbsUp className='h-3 w-3' />
                              Helpful
                            </button>
                            <button
                              onClick={() =>
                                handleMessageFeedback(msg.id, 'not_helpful')
                              }
                              aria-label='Mark response not helpful'
                              tabIndex={0}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold border-2 transition-colors ${
                                messageFeedback?.rating === 'not_helpful'
                                  ? 'bg-destructive/15 text-destructive border-destructive/40'
                                  : 'bg-background text-muted-foreground border-border hover:text-foreground'
                              }`}
                            >
                              <ThumbsDown className='h-3 w-3' />
                              Not helpful
                            </button>
                          </div>

                          {negativeFeedbackDrafts[msg.id]?.open && (
                            <div className='mt-2 border-2 border-border bg-muted/40 p-2.5 space-y-2'>
                              <p className='text-[10px] font-black uppercase tracking-wider text-destructive'>
                                Improve this response
                              </p>
                              <div className='flex flex-wrap gap-1.5'>
                                {NEGATIVE_FEEDBACK_OPTIONS.map((option) => (
                                  <button
                                    key={option.id}
                                    onClick={() =>
                                      setNegativeFeedbackDrafts((prev) => ({
                                        ...prev,
                                        [msg.id]: {
                                          ...prev[msg.id],
                                          reason: option.id,
                                        },
                                      }))
                                    }
                                    tabIndex={0}
                                    aria-label={`Feedback reason: ${option.label}`}
                                    className={`px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 ${
                                      negativeFeedbackDrafts[msg.id]?.reason === option.id
                                        ? 'bg-destructive/15 text-destructive border-destructive/40'
                                        : 'bg-background text-muted-foreground border-border hover:text-foreground'
                                    }`}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                              {negativeFeedbackDrafts[msg.id]?.reason === 'other' && (
                                <textarea
                                  value={negativeFeedbackDrafts[msg.id]?.freeText ?? ''}
                                  onChange={(event) =>
                                    setNegativeFeedbackDrafts((prev) => ({
                                      ...prev,
                                      [msg.id]: {
                                        ...prev[msg.id],
                                        freeText: event.target.value,
                                      },
                                    }))
                                  }
                                  rows={2}
                                  className='w-full border-2 border-border bg-background px-2 py-1 text-xs font-medium resize-none'
                                  placeholder='Optional details'
                                  aria-label='Feedback details'
                                />
                              )}
                              <div className='flex gap-1.5'>
                                <button
                                  onClick={() => handleSubmitNegativeFeedback(msg.id)}
                                  tabIndex={0}
                                  aria-label='Submit negative feedback'
                                  className='px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-primary text-primary-foreground'
                                >
                                  Save feedback
                                </button>
                                <button
                                  onClick={() =>
                                    setNegativeFeedbackDrafts((prev) => ({
                                      ...prev,
                                      [msg.id]: {
                                        ...prev[msg.id],
                                        open: false,
                                      },
                                    }))
                                  }
                                  tabIndex={0}
                                  aria-label='Cancel negative feedback'
                                  className='px-2 py-1 text-[10px] font-black uppercase tracking-wider border-2 border-border bg-background hover:bg-muted'
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </>
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
          <div className='px-2 pb-2'>
            <AiErrorBanner
              error={
                parsedChatError ??
                parseAiErrorFromUnknown(
                  {error: activeChat.error?.message ?? 'Something went wrong'},
                  'Something went wrong. Please try again.',
                )
              }
              className='text-xs'
            />
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

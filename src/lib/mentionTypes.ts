// ============================================================
// @-Mention Type Registry — Categories for explicit context
// ============================================================
//
// Defines all mention categories available when the user types
// `@` in the chat input. Each category maps to a data source
// and optional sub-item selection.

import {
  Target,
  AlertTriangle,
  UtensilsCrossed,
  TrendingUp,
  BarChart3,
  Activity,
  Footprints,
  Dumbbell,
  ClipboardList,
  Layers,
  type LucideIcon,
} from 'lucide-react';

// ----- Types -----

/** A mention category the user can select from the @-popup. */
export interface MentionCategory {
  /** Unique identifier, e.g. 'training', 'gear'. Used as the @-prefix. */
  id: string;
  /** Display label shown in the popup. */
  label: string;
  /** Lucide icon shown next to the label. */
  icon: LucideIcon;
  /** If true, selecting this category opens a sub-item list (e.g., pick a shoe). */
  hasSubItems: boolean;
  /** Short description shown in the popup below the label. */
  description: string;
}

/** A reference to data the user attached via @-mention. */
export interface MentionReference {
  /** Which category this references. */
  categoryId: string;
  /** Specific item ID (shoe ID, activity ID) or undefined for whole category. */
  itemId?: string;
  /** Display text for the pill, e.g. "@gear: Nike Pegasus 41". */
  label: string;
}

/** Resolved mention data ready to send to the server. */
export interface ResolvedMention {
  /** Category ID. */
  categoryId: string;
  /** Display label for the pill. */
  label: string;
  /** Serialized text data for the LLM to consume. */
  data: string;
}

// ----- Category registry -----

export const MENTION_CATEGORIES: MentionCategory[] = [
  {
    id: 'goal',
    label: 'Training Goal',
    icon: Target,
    hasSubItems: false,
    description: 'Your stated training goal',
  },
  {
    id: 'injuries',
    label: 'Injuries',
    icon: AlertTriangle,
    hasSubItems: false,
    description: 'Current reported injuries',
  },
  {
    id: 'diet',
    label: 'Diet & Allergies',
    icon: UtensilsCrossed,
    hasSubItems: false,
    description: 'Allergies and food preferences',
  },
  {
    id: 'training',
    label: 'Training Summary',
    icon: TrendingUp,
    hasSubItems: false,
    description: 'Volume, pace, and trends (4 weeks)',
  },
  {
    id: 'zones',
    label: 'Zone Distribution',
    icon: BarChart3,
    hasSubItems: false,
    description: 'HR zone time percentages',
  },
  {
    id: 'fitness',
    label: 'Fitness Metrics',
    icon: Activity,
    hasSubItems: false,
    description: 'BF, LI, IT, ACWR metrics',
  },
  {
    id: 'activity',
    label: 'Activity',
    icon: Footprints,
    hasSubItems: true,
    description: 'Pick a specific recent run',
  },
  {
    id: 'gear',
    label: 'Gear',
    icon: Dumbbell,
    hasSubItems: true,
    description: 'Pick a specific shoe',
  },
  {
    id: 'plan',
    label: 'Weekly Plan',
    icon: ClipboardList,
    hasSubItems: false,
    description: 'Active unified weekly plan (running + physio)',
  },
  {
    id: 'block',
    label: 'Training Block',
    icon: Layers,
    hasSubItems: false,
    description: 'Active periodized macro plan with phases and weekly outlines',
  },
];

/** Lookup a category by ID. */
export const getMentionCategory = (id: string): MentionCategory | undefined =>
  MENTION_CATEGORIES.find((c) => c.id === id);

// ----- Mention metadata in message text -----

const MENTION_META_RE = /^<!-- mentions:(.*?) -->\n/;

/** Parse mention metadata encoded in a message text string.
 *  Returns the decoded mentions and the clean display text. */
export const parseMentionMeta = (
  text: string,
): {mentions: MentionReference[]; cleanText: string} => {
  const match = text.match(MENTION_META_RE);
  if (!match) return {mentions: [], cleanText: text};
  try {
    const mentions = JSON.parse(match[1]) as MentionReference[];
    return {mentions, cleanText: text.slice(match[0].length)};
  } catch {
    return {mentions: [], cleanText: text};
  }
};

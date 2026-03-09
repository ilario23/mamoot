export type PlanSlotType = "coach_session" | "physio_placeholder" | "physio_session";

export type PlanSlotStatus = "empty" | "assigned" | "completed";

export type PlanOwnerRole = "coach" | "physio";

export interface PlanSlot {
  id: string;
  day: string;
  title: string;
  description?: string;
  slotType?: PlanSlotType;
  ownerRole?: PlanOwnerRole;
  status?: PlanSlotStatus;
  required?: boolean;
  fillByDate?: string;
  constraints?: string[];
  placeholderId?: string;
  metadata?: Record<string, unknown>;
}

export interface WeeklyPlan {
  id: string;
  athleteId?: string;
  weekStartDate?: string;
  slots: PlanSlot[];
}

export interface PhysioFill {
  placeholderId: string;
  title: string;
  description?: string;
  constraints?: string[];
  metadata?: Record<string, unknown>;
}

export interface PublishValidationIssue {
  code:
    | "MISSING_REQUIRED_PHYSIO_SLOT"
    | "UNKNOWN_PLACEHOLDER_REFERENCE"
    | "INVALID_PLACEHOLDER";
  message: string;
  placeholderId?: string;
}

export interface PublishValidationResult {
  isReady: boolean;
  issues: PublishValidationIssue[];
}

export function normalizeLegacySlot(slot: PlanSlot): PlanSlot {
  const slotType: PlanSlotType = slot.slotType ?? "coach_session";
  const ownerRole: PlanOwnerRole =
    slot.ownerRole ?? (slotType === "physio_session" ? "physio" : "coach");
  const status: PlanSlotStatus =
    slot.status ??
    (slotType === "physio_placeholder" ? "empty" : "assigned");

  return {
    ...slot,
    slotType,
    ownerRole,
    status,
    required: slot.required ?? false,
    constraints: slot.constraints ?? [],
  };
}

export function normalizeLegacyPlan(plan: WeeklyPlan): WeeklyPlan {
  return {
    ...plan,
    slots: plan.slots.map(normalizeLegacySlot),
  };
}

export function reservePhysioSlot(
  base: Omit<PlanSlot, "slotType" | "ownerRole" | "status" | "placeholderId"> & {
    placeholderId: string;
    required?: boolean;
    constraints?: string[];
  },
): PlanSlot {
  return {
    ...base,
    slotType: "physio_placeholder",
    ownerRole: "physio",
    status: "empty",
    required: base.required ?? true,
    constraints: base.constraints ?? [],
    placeholderId: base.placeholderId,
  };
}

export function mergeCoachPlanWithPhysioFills(
  coachPlan: WeeklyPlan,
  physioFills: PhysioFill[],
): WeeklyPlan {
  const normalized = normalizeLegacyPlan(coachPlan);
  const fillMap = new Map<string, PhysioFill>();

  for (const fill of physioFills) {
    fillMap.set(fill.placeholderId, fill);
  }

  const mergedSlots = normalized.slots.map((slot) => {
    if (slot.slotType !== "physio_placeholder" || !slot.placeholderId) {
      return slot;
    }

    const fill = fillMap.get(slot.placeholderId);
    if (!fill) {
      return slot;
    }

    return {
      ...slot,
      title: fill.title,
      description: fill.description ?? slot.description,
      constraints: fill.constraints ?? slot.constraints ?? [],
      metadata: { ...(slot.metadata ?? {}), ...(fill.metadata ?? {}) },
      slotType: "physio_session" as const,
      ownerRole: "physio" as const,
      status: "assigned" as const,
    };
  });

  return {
    ...normalized,
    slots: mergedSlots,
  };
}

export function validatePhysioFills(
  coachPlan: WeeklyPlan,
  physioFills: PhysioFill[],
): PublishValidationIssue[] {
  const normalized = normalizeLegacyPlan(coachPlan);
  const validPlaceholderIds = new Set(
    normalized.slots
      .filter((slot) => slot.slotType === "physio_placeholder" && slot.placeholderId)
      .map((slot) => slot.placeholderId as string),
  );

  const issues: PublishValidationIssue[] = [];

  for (const fill of physioFills) {
    if (!validPlaceholderIds.has(fill.placeholderId)) {
      issues.push({
        code: "UNKNOWN_PLACEHOLDER_REFERENCE",
        message: `Physio fill references unknown placeholderId "${fill.placeholderId}".`,
        placeholderId: fill.placeholderId,
      });
    }
  }

  return issues;
}

export function validatePlanReadyForPublish(plan: WeeklyPlan): PublishValidationResult {
  const normalized = normalizeLegacyPlan(plan);
  const issues: PublishValidationIssue[] = [];

  for (const slot of normalized.slots) {
    if (slot.slotType !== "physio_placeholder") {
      continue;
    }

    if (!slot.placeholderId) {
      issues.push({
        code: "INVALID_PLACEHOLDER",
        message: `Physio placeholder "${slot.id}" is missing placeholderId.`,
      });
      continue;
    }

    if (slot.required && slot.status === "empty") {
      issues.push({
        code: "MISSING_REQUIRED_PHYSIO_SLOT",
        message: `Required physio placeholder "${slot.placeholderId}" is still empty.`,
        placeholderId: slot.placeholderId,
      });
    }
  }

  return {
    isReady: issues.length === 0,
    issues,
  };
}

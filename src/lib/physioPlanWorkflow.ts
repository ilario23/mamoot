import {
  type PhysioFill,
  type PlanSlot,
  type WeeklyPlan,
  mergeCoachPlanWithPhysioFills,
  normalizeLegacyPlan,
  reservePhysioSlot,
  validatePhysioFills,
  validatePlanReadyForPublish,
} from "./physioPlanSlots";

export interface CreateCoachPlanInput {
  planId: string;
  athleteId?: string;
  weekStartDate?: string;
  coachSlots: PlanSlot[];
  physioPlaceholders?: Array<
    Omit<PlanSlot, "slotType" | "ownerRole" | "status" | "placeholderId"> & {
      placeholderId: string;
      required?: boolean;
      constraints?: string[];
    }
  >;
}

export interface ApplyPhysioFillsResult {
  plan: WeeklyPlan;
  issues: ReturnType<typeof validatePhysioFills>;
}

export interface FinalizePlanResult {
  plan: WeeklyPlan;
  publishValidation: ReturnType<typeof validatePlanReadyForPublish>;
}

export function createCoachPlan(input: CreateCoachPlanInput): WeeklyPlan {
  const coachPlan: WeeklyPlan = {
    id: input.planId,
    athleteId: input.athleteId,
    weekStartDate: input.weekStartDate,
    slots: [
      ...input.coachSlots.map((slot) => ({
        ...slot,
        slotType: slot.slotType ?? "coach_session",
        ownerRole: slot.ownerRole ?? "coach",
        status: slot.status ?? "assigned",
      })),
      ...(input.physioPlaceholders ?? []).map((slot) => reservePhysioSlot(slot)),
    ],
  };

  return normalizeLegacyPlan(coachPlan);
}

export function applyPhysioFills(
  coachPlan: WeeklyPlan,
  physioFills: PhysioFill[],
): ApplyPhysioFillsResult {
  const issues = validatePhysioFills(coachPlan, physioFills);
  const plan = mergeCoachPlanWithPhysioFills(coachPlan, physioFills);

  return { plan, issues };
}

export function finalizePlan(plan: WeeklyPlan): FinalizePlanResult {
  const normalized = normalizeLegacyPlan(plan);
  const publishValidation = validatePlanReadyForPublish(normalized);
  return { plan: normalized, publishValidation };
}

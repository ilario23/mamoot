import {
  type PhysioFill,
  type PlanSlot,
  type WeeklyPlan,
} from "./physioPlanSlots";
import {
  applyPhysioFills,
  createCoachPlan,
  finalizePlan,
} from "./physioPlanWorkflow";

export interface CoachQuickAskBuildInput {
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

export interface PhysioQuickAskFillInput {
  coachPlan: WeeklyPlan;
  physioFills: PhysioFill[];
}

export function createCoachPlanFromQuickAsk(
  input: CoachQuickAskBuildInput,
): WeeklyPlan {
  return createCoachPlan({
    planId: input.planId,
    athleteId: input.athleteId,
    weekStartDate: input.weekStartDate,
    coachSlots: input.coachSlots,
    physioPlaceholders: input.physioPlaceholders ?? [],
  });
}

export function applyPhysioFillsFromQuickAsk(input: PhysioQuickAskFillInput) {
  return applyPhysioFills(input.coachPlan, input.physioFills);
}

export function finalizeCollaborativePlan(plan: WeeklyPlan) {
  return finalizePlan(plan);
}

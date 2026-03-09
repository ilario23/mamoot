import { describe, expect, it } from "vitest";

import {
  applyPhysioFillsFromQuickAsk,
  createCoachPlanFromQuickAsk,
  finalizeCollaborativePlan,
} from "./weeklyPlanQuickAskCollab";

describe("weeklyPlanQuickAskCollab", () => {
  it("runs coach -> physio -> finalize flow", () => {
    const coachPlan = createCoachPlanFromQuickAsk({
      planId: "plan-collab-1",
      coachSlots: [
        {
          id: "coach-1",
          day: "monday",
          title: "Easy Run",
        },
      ],
      physioPlaceholders: [
        {
          id: "physio-1",
          day: "tuesday",
          title: "Reserved for physio",
          placeholderId: "ph-1",
          required: true,
        },
      ],
    });

    const applied = applyPhysioFillsFromQuickAsk({
      coachPlan,
      physioFills: [
        {
          placeholderId: "ph-1",
          title: "Ankle rehab routine",
          description: "15 min ankle mobility + strength",
        },
      ],
    });

    expect(applied.issues).toHaveLength(0);

    const finalized = finalizeCollaborativePlan(applied.plan);
    expect(finalized.publishValidation.isReady).toBe(true);
  });
});

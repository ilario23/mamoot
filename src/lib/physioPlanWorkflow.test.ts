import { describe, expect, it } from "vitest";

import {
  applyPhysioFills,
  createCoachPlan,
  finalizePlan,
} from "./physioPlanWorkflow";

describe("physioPlanWorkflow", () => {
  it("flags unknown placeholder references in physio fills", () => {
    const plan = createCoachPlan({
      planId: "plan-1",
      coachSlots: [
        {
          id: "coach-1",
          day: "monday",
          title: "Easy Run",
        },
      ],
      physioPlaceholders: [
        {
          id: "physio-slot-1",
          day: "tuesday",
          title: "Physio reserved",
          placeholderId: "placeholder-1",
          required: true,
        },
      ],
    });

    const result = applyPhysioFills(plan, [
      {
        placeholderId: "placeholder-unknown",
        title: "Rehab work",
      },
    ]);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe("UNKNOWN_PLACEHOLDER_REFERENCE");
  });

  it("blocks publish when required physio placeholders are still empty", () => {
    const plan = createCoachPlan({
      planId: "plan-2",
      coachSlots: [],
      physioPlaceholders: [
        {
          id: "physio-slot-1",
          day: "wednesday",
          title: "Knee rehab slot",
          placeholderId: "placeholder-required",
          required: true,
        },
      ],
    });

    const finalized = finalizePlan(plan);

    expect(finalized.publishValidation.isReady).toBe(false);
    expect(finalized.publishValidation.issues[0]?.code).toBe(
      "MISSING_REQUIRED_PHYSIO_SLOT",
    );
  });

  it("allows publish once required placeholder is filled", () => {
    const plan = createCoachPlan({
      planId: "plan-3",
      coachSlots: [],
      physioPlaceholders: [
        {
          id: "physio-slot-1",
          day: "thursday",
          title: "Mobility slot",
          placeholderId: "placeholder-fill",
          required: true,
        },
      ],
    });

    const applied = applyPhysioFills(plan, [
      {
        placeholderId: "placeholder-fill",
        title: "Hip mobility + glute activation",
        description: "20 min easy mobility and activation",
      },
    ]);

    expect(applied.issues).toHaveLength(0);

    const finalized = finalizePlan(applied.plan);
    expect(finalized.publishValidation.isReady).toBe(true);
    expect(finalized.publishValidation.issues).toHaveLength(0);
  });
});

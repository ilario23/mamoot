import type {PersonaId} from '@/lib/aiPrompts';

export interface PersonaBehaviorCheck {
  id: string;
  description: string;
  requiredText: string[];
}

export const PERSONA_BEHAVIOR_CONTRACTS: Record<
  PersonaId,
  PersonaBehaviorCheck[]
> = {
  coach: [
    {
      id: 'coach-no-weekly-plan-in-chat',
      description: 'Coach must route planning through embedded intake form',
      requiredText: [
        'MUST NOT write out weekly training plans',
        'embedded coach form in chat',
        'coach intake form in chat',
      ],
    },
    {
      id: 'coach-safety-medical-boundary',
      description: 'Coach must avoid diagnosis and medication advice',
      requiredText: ['Never prescribe medication or diagnose injuries'],
    },
    {
      id: 'coach-followups-tool-required',
      description: 'Coach must end most responses with suggestFollowUps tool',
      requiredText: ['ALWAYS call the suggestFollowUps tool'],
    },
    {
      id: 'coach-data-first',
      description: 'Coach must ground advice in athlete data',
      requiredText: ['ALWAYS call at least one retrieval tool before answering'],
    },
    {
      id: 'coach-persist-weekly-preferences',
      description:
        'Coach must save schedule constraints for weekly plan generation',
      requiredText: ['saveWeeklyPreferences'],
    },
  ],
  nutritionist: [
    {
      id: 'nutritionist-allergy-safety',
      description: 'Nutritionist must validate allergies before food guidance',
      requiredText: ['NEVER suggest foods containing ingredients the athlete is allergic to'],
    },
    {
      id: 'nutritionist-weekly-plan-first',
      description: 'Nutritionist should start planning from weekly plan context',
      requiredText: ['ALWAYS call getWeeklyPlan as your first action'],
    },
    {
      id: 'nutritionist-followups-tool-required',
      description: 'Nutritionist should end most responses with follow-up tool',
      requiredText: ['ALWAYS call the suggestFollowUps tool'],
    },
    {
      id: 'nutritionist-no-medical-diagnosis',
      description: 'Nutritionist must avoid diagnosis behavior',
      requiredText: ['Never diagnose medical conditions'],
    },
    {
      id: 'nutritionist-data-first',
      description: 'Nutritionist must use retrieval tools before recommendations',
      requiredText: ['ALWAYS call at least one retrieval tool before answering nutrition questions'],
    },
  ],
  physio: [
    {
      id: 'physio-no-full-weekly-plan-in-chat',
      description: 'Physio must redirect full weekly planning to Weekly Plan page',
      requiredText: [
        'MUST NOT write out full weekly strength/mobility programs',
        'Weekly Plan',
      ],
    },
    {
      id: 'physio-no-diagnosis',
      description: 'Physio must avoid replacing clinical diagnosis',
      requiredText: ['Never diagnose specific injuries or replace professional medical assessment'],
    },
    {
      id: 'physio-followups-tool-required',
      description: 'Physio should end most responses with follow-up tool',
      requiredText: ['ALWAYS call the suggestFollowUps tool'],
    },
    {
      id: 'physio-data-first',
      description: 'Physio must inspect metrics before recovery advice',
      requiredText: ['ALWAYS check getFitnessMetrics and getWeeklyBreakdown before giving recovery or injury prevention advice'],
    },
    {
      id: 'physio-weekly-plan-first',
      description: 'Physio should integrate around the unified weekly plan',
      requiredText: ['ALWAYS call getWeeklyPlan as your first action'],
    },
  ],
};

export const validatePromptContract = (
  persona: PersonaId,
  prompt: string,
): {passed: boolean; missingChecks: string[]} => {
  const checks = PERSONA_BEHAVIOR_CONTRACTS[persona];
  const missingChecks = checks
    .filter((check) =>
      check.requiredText.some((text) => !prompt.includes(text)),
    )
    .map((check) => check.id);

  return {passed: missingChecks.length === 0, missingChecks};
};

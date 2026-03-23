export type PlanEnv = 'dev' | 'prod';

const PLAN_ENV_VALUES: PlanEnv[] = ['dev', 'prod'];

export const isPlanEnv = (value: unknown): value is PlanEnv =>
  typeof value === 'string' && PLAN_ENV_VALUES.includes(value as PlanEnv);

export const getDefaultPlanEnv = (): PlanEnv =>
  process.env.NODE_ENV === 'development' ? 'dev' : 'prod';

export const resolvePlanEnv = (value?: unknown): PlanEnv =>
  isPlanEnv(value) ? value : getDefaultPlanEnv();

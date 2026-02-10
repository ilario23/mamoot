// ============================================================
// useAthleteSummary — Builds a compact athlete context for AI chat
// ============================================================
//
// Gathers data from the existing React Query hooks (activities,
// gear, zone breakdowns) and the settings/auth contexts, then
// returns a serialized AthleteSummary ready to send with chat requests.

import {useMemo} from 'react';
import {useActivities, useAthleteGear, useZoneBreakdowns} from './useStrava';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {useSettings} from '@/contexts/SettingsContext';
import {buildAthleteSummary, serializeAthleteSummary} from '@/lib/aiContext';
import type {AthleteSummary} from '@/lib/aiContext';

interface UseAthleteSummaryResult {
  /** The structured summary object */
  summary: AthleteSummary | null;
  /** The serialized text version for the system prompt */
  serialized: string | null;
  /** Whether the data is still loading */
  isLoading: boolean;
}

export const useAthleteSummary = (): UseAthleteSummaryResult => {
  const {athlete} = useStravaAuth();
  const {settings} = useSettings();
  const {data: activities, isLoading: activitiesLoading} = useActivities();
  const {data: gear, isLoading: gearLoading} = useAthleteGear();
  const {data: zoneBreakdowns, isLoading: zonesLoading} = useZoneBreakdowns(4);

  const isLoading = activitiesLoading || gearLoading || zonesLoading;

  const summary = useMemo(() => {
    if (!activities || activities.length === 0) return null;

    return buildAthleteSummary({
      athleteName: athlete?.firstname ?? 'Athlete',
      settings,
      goal: settings.goal ?? '',
      activities,
      gear: gear ?? null,
      zoneBreakdowns: zoneBreakdowns ?? null,
    });
  }, [athlete?.firstname, settings, activities, gear, zoneBreakdowns]);

  const serialized = useMemo(() => {
    if (!summary) return null;
    return serializeAthleteSummary(summary);
  }, [summary]);

  return {summary, serialized, isLoading};
};

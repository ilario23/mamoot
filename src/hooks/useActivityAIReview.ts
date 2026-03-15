'use client';

import {useCallback, useEffect, useMemo, useState} from 'react';
import {useStravaAuth} from '@/contexts/StravaAuthContext';

type UsagePayload = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model?: string;
  savedAt?: number;
  error?: string;
};

type SavedReviewResponse = {
  review: {
    reportText: string;
    rawDetailText?: string | null;
    usage?: UsagePayload | null;
    weather?: unknown;
    updatedAt: number;
  } | null;
};

type ParsedStreamPayload = {
  reportText: string;
  rawDetailText: string | null;
  usage: UsagePayload | null;
};

const parseSentinelPayload = (raw: string): ParsedStreamPayload => {
  const detailMatch = raw.match(/__DETAIL__([\s\S]*?)__END_DETAIL__/);
  const usageMatch = raw.match(/__USAGE__(\{[\s\S]*\})\s*$/);
  const rawDetailText = detailMatch?.[1]?.trim() ?? null;

  let usage: UsagePayload | null = null;
  if (usageMatch?.[1]) {
    try {
      usage = JSON.parse(usageMatch[1]) as UsagePayload;
    } catch {
      usage = null;
    }
  }

  const reportText = raw
    .replace(/__DETAIL__[\s\S]*?__END_DETAIL__/g, '')
    .replace(/__USAGE__\{[\s\S]*\}\s*$/g, '')
    .trim();

  return {reportText, rawDetailText, usage};
};

const stripProtocolForDisplay = (raw: string): string => {
  let sanitized = raw;

  const detailStart = sanitized.indexOf('__DETAIL__');
  if (detailStart !== -1) {
    const detailEnd = sanitized.indexOf('__END_DETAIL__');
    if (detailEnd !== -1) {
      sanitized =
        sanitized.slice(0, detailStart) + sanitized.slice(detailEnd + 13);
    } else {
      sanitized = sanitized.slice(0, detailStart);
    }
  }

  const usageStart = sanitized.indexOf('__USAGE__');
  if (usageStart !== -1) {
    sanitized = sanitized.slice(0, usageStart);
  }

  return sanitized.trim();
};

export const useActivityAIReview = ({
  activityId,
  model,
}: {
  activityId?: string;
  model?: string;
}) => {
  const {athlete} = useStravaAuth();
  const athleteId = athlete?.id ?? null;

  const [reportText, setReportText] = useState('');
  const [rawDetailText, setRawDetailText] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsagePayload | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const canQuery = Boolean(activityId && model && athleteId);

  const loadSaved = useCallback(async () => {
    if (!canQuery || !activityId || !model || !athleteId) {
      setReportText('');
      setRawDetailText(null);
      setUsage(null);
      setSavedAt(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const url = new URL('/api/ai/activity-report', window.location.origin);
      url.searchParams.set('athleteId', String(athleteId));
      url.searchParams.set('activityId', activityId);
      url.searchParams.set('model', model);
      const response = await fetch(url.toString(), {method: 'GET'});
      if (!response.ok) {
        throw new Error(`Failed to load saved review (${response.status})`);
      }
      const payload = (await response.json()) as SavedReviewResponse;
      const saved = payload.review;
      if (!saved) {
        setReportText('');
        setRawDetailText(null);
        setUsage(null);
        setSavedAt(null);
        return;
      }
      setReportText(saved.reportText ?? '');
      setRawDetailText(saved.rawDetailText ?? null);
      setUsage(saved.usage ?? null);
      setSavedAt(saved.updatedAt ?? null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load saved AI review';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [activityId, athleteId, canQuery, model]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  const generate = useCallback(async () => {
    if (!canQuery || !activityId || !model || !athleteId) return;
    setIsLoading(true);
    setError(null);
    setUsage(null);
    setReportText('');

    try {
      const response = await fetch('/api/ai/activity-report', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          athleteId,
          activityId: Number(activityId),
          model,
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Generation failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        setReportText(stripProtocolForDisplay(buffer));
      }

      const parsed = parseSentinelPayload(buffer);
      setReportText(parsed.reportText);
      setRawDetailText(parsed.rawDetailText);
      setUsage(parsed.usage);
      if (parsed.usage?.savedAt) {
        setSavedAt(parsed.usage.savedAt);
      } else {
        setSavedAt(Date.now());
      }

      if (parsed.usage?.error) {
        setError(parsed.usage.error);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate AI review';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [activityId, athleteId, canQuery, model]);

  return useMemo(
    () => ({
      reportText,
      rawDetailText,
      usage,
      savedAt,
      error,
      isLoading,
      hasSavedReview: reportText.trim().length > 0,
      generate,
      reloadSaved: loadSaved,
    }),
    [error, generate, isLoading, loadSaved, rawDetailText, reportText, savedAt, usage],
  );
};

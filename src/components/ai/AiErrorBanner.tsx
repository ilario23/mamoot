'use client';

import {AlertCircle} from 'lucide-react';
import type {AiClientError, AiErrorPayload} from '@/lib/aiErrors';

type AiDisplayError = AiErrorPayload & Partial<Pick<AiClientError, 'traceId'>>;

interface AiErrorBannerProps {
  error: AiDisplayError;
  className?: string;
}

const AiErrorBanner = ({error, className = ''}: AiErrorBannerProps) => (
  <div
    className={`border-3 border-border bg-destructive/10 text-destructive shadow-neo-sm p-3 space-y-2 ${className}`.trim()}
    role='alert'
  >
    <div className='flex items-start gap-2'>
      <AlertCircle className='h-4 w-4 shrink-0 mt-0.5' />
      <div className='space-y-1 min-w-0'>
        <p className='text-sm font-black'>{error.error}</p>
        {error.recoveryActions.length > 0 && (
          <p className='text-xs font-medium'>
            Try: {error.recoveryActions.join(' · ')}
          </p>
        )}
        {error.traceId && (
          <p className='text-[10px] font-bold uppercase tracking-wider break-all'>
            Trace: {error.traceId}
          </p>
        )}
      </div>
    </div>
  </div>
);

export default AiErrorBanner;

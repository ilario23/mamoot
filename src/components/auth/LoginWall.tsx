'use client';

import {Suspense, useEffect, useRef} from 'react';
import {useSearchParams, useRouter} from 'next/navigation';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {toast} from '@/hooks/use-toast';
import {Loader2, Activity, BarChart3, Brain, Trophy} from 'lucide-react';

const features = [
  {icon: Activity, label: 'Activity Tracking'},
  {icon: BarChart3, label: 'Zone Analytics'},
  {icon: Brain, label: 'AI Coaching'},
  {icon: Trophy, label: 'Personal Records'},
];

const LoginWallContent = () => {
  const {login, handleOAuthCallback, isLoading} = useStravaAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isExchangingRef = useRef(false);

  // Handle OAuth callback when redirected back from Strava
  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      toast({
        title: 'Strava Authorization Failed',
        description: 'You denied access or an error occurred.',
        variant: 'destructive',
      });
      router.replace('/', {scroll: false});
      return;
    }

    if (code && !isExchangingRef.current) {
      isExchangingRef.current = true;
      handleOAuthCallback(code)
        .then(() => {
          toast({
            title: 'Strava Connected',
            description: 'Your Strava account has been linked successfully.',
          });
        })
        .catch(() => {
          isExchangingRef.current = false;
          toast({
            title: 'Connection Failed',
            description:
              'Could not link your Strava account. Please try again.',
            variant: 'destructive',
          });
        })
        .finally(() => {
          router.replace('/', {scroll: false});
        });
    }
  }, [searchParams, handleOAuthCallback, router]);

  const handleConnect = () => {
    login();
  };

  if (isLoading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-background pt-safe pb-safe'>
        <div className='flex flex-col items-center gap-4'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
          <p className='font-bold text-sm text-muted-foreground'>
            Connecting to Strava...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='min-h-screen flex flex-col items-center justify-center bg-background px-4 pt-safe pb-safe'>
      <div className='w-full max-w-md flex flex-col items-center gap-8'>
        {/* Logo */}
        <div className='flex items-center gap-3'>
          <div className='w-14 h-14 bg-primary border-3 border-border shadow-neo flex items-center justify-center shrink-0'>
            <span className='font-black text-2xl text-primary-foreground leading-none select-none'>
              R
            </span>
          </div>
          <div>
            <h1 className='font-black text-3xl tracking-tight leading-none'>
              RunTeam
            </h1>
            <span className='inline-block mt-1 bg-foreground text-background text-xs font-black px-2 py-0.5 uppercase tracking-widest select-none'>
              AI
            </span>
          </div>
        </div>

        {/* Tagline */}
        <p className='text-center font-bold text-muted-foreground text-base max-w-xs'>
          AI-powered running analytics. Connect your Strava account to get
          started.
        </p>

        {/* Feature pills */}
        <div className='flex flex-wrap justify-center gap-2'>
          {features.map((feature) => (
            <div
              key={feature.label}
              className='flex items-center gap-2 px-3 py-2 border-3 border-border bg-background shadow-neo-sm font-bold text-xs'
            >
              <feature.icon className='h-4 w-4 text-primary' />
              {feature.label}
            </div>
          ))}
        </div>

        {/* Connect button */}
        <button
          type='button'
          onClick={handleConnect}
          aria-label='Connect with Strava'
          tabIndex={0}
          className='w-full px-6 py-4 font-black text-base text-white border-3 border-border shadow-neo hover:shadow-neo-lg hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all active:shadow-none active:translate-x-[1px] active:translate-y-[1px] cursor-pointer'
          style={{backgroundColor: '#FC4C02'}}
        >
          Connect with Strava
        </button>

        {/* Footer note */}
        <p className='text-center text-xs font-bold text-muted-foreground'>
          We only read your activity data. We never post on your behalf.
        </p>
      </div>
    </div>
  );
};

const LoginWall = () => {
  return (
    <Suspense
      fallback={
        <div className='min-h-screen flex items-center justify-center bg-background pt-safe pb-safe'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      }
    >
      <LoginWallContent />
    </Suspense>
  );
};

export default LoginWall;

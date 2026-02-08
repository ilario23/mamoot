'use client';

import Link from 'next/link';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {Avatar, AvatarFallback, AvatarImage} from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Skeleton} from '@/components/ui/skeleton';
import {UserCircle, Settings, LogOut, ChevronsUpDown} from 'lucide-react';

interface SidebarUserProfileProps {
  compact?: boolean;
}

const SidebarUserProfile = ({compact = false}: SidebarUserProfileProps) => {
  const {isAuthenticated, isLoading, athlete, login, logout} = useStravaAuth();

  if (isLoading) {
    return <UserProfileSkeleton compact={compact} />;
  }

  if (!isAuthenticated || !athlete) {
    return <GuestProfile compact={compact} onConnect={login} />;
  }

  const fullName = `${athlete.firstname} ${athlete.lastname}`.trim();
  const initials =
    `${athlete.firstname?.[0] ?? ''}${athlete.lastname?.[0] ?? ''}`.toUpperCase();
  const location = [athlete.city, athlete.state].filter(Boolean).join(', ');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type='button'
          aria-label='User menu'
          className={`flex items-center gap-3 w-full text-left transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            compact ? 'p-1' : 'p-3 border-t-3 border-border'
          }`}
        >
          <Avatar className='h-9 w-9 shrink-0 border-3 border-border shadow-neo-sm'>
            <AvatarImage src={athlete.profile_medium} alt={fullName} />
            <AvatarFallback className='bg-primary text-primary-foreground font-bold text-xs'>
              {initials}
            </AvatarFallback>
          </Avatar>

          {!compact && (
            <>
              <div className='flex-1 min-w-0'>
                <p className='font-bold text-sm truncate'>{fullName}</p>
                {location && (
                  <p className='text-xs text-muted-foreground truncate'>
                    {location}
                  </p>
                )}
              </div>
              <ChevronsUpDown className='h-4 w-4 shrink-0 text-muted-foreground' />
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={compact ? 'bottom' : 'top'}
        align='start'
        className='w-56 border-3 border-border shadow-neo bg-background'
      >
        <DropdownMenuLabel className='font-bold'>
          <div className='flex items-center gap-3'>
            <Avatar className='h-8 w-8 border-3 border-border'>
              <AvatarImage src={athlete.profile_medium} alt={fullName} />
              <AvatarFallback className='bg-primary text-primary-foreground font-bold text-xs'>
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
              <p className='text-sm font-bold truncate'>{fullName}</p>
              {location && (
                <p className='text-xs font-normal text-muted-foreground truncate'>
                  {location}
                </p>
              )}
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className='bg-border' />

        <DropdownMenuItem asChild className='cursor-pointer font-medium'>
          <Link href='/settings'>
            <Settings className='mr-2 h-4 w-4' />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className='bg-border' />

        <DropdownMenuItem
          onClick={logout}
          className='cursor-pointer font-medium text-destructive focus:text-destructive'
        >
          <LogOut className='mr-2 h-4 w-4' />
          Disconnect Strava
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const GuestProfile = ({
  compact,
  onConnect,
}: {
  compact: boolean;
  onConnect: () => void;
}) => {
  if (compact) {
    return (
      <button
        type='button'
        onClick={onConnect}
        aria-label='Connect with Strava'
        className='p-1 transition-all hover:bg-muted'
      >
        <div className='h-9 w-9 flex items-center justify-center border-3 border-border bg-muted shadow-neo-sm'>
          <UserCircle className='h-5 w-5 text-muted-foreground' />
        </div>
      </button>
    );
  }

  return (
    <div className='p-3 border-t-3 border-border'>
      <div className='flex items-center gap-3 mb-3'>
        <div className='h-9 w-9 flex items-center justify-center shrink-0 border-3 border-border bg-muted shadow-neo-sm'>
          <UserCircle className='h-5 w-5 text-muted-foreground' />
        </div>
        <div className='min-w-0'>
          <p className='font-bold text-sm'>Guest</p>
          <p className='text-xs text-muted-foreground'>Not connected</p>
        </div>
      </div>
      <button
        type='button'
        onClick={onConnect}
        aria-label='Connect with Strava'
        className='w-full px-4 py-2 text-sm font-bold border-3 border-border bg-primary text-primary-foreground shadow-neo-sm hover:shadow-neo active:shadow-none active:translate-x-[1px] active:translate-y-[1px] transition-all'
      >
        Connect Strava
      </button>
    </div>
  );
};

const UserProfileSkeleton = ({compact}: {compact: boolean}) => {
  if (compact) {
    return (
      <div className='p-1'>
        <Skeleton className='h-9 w-9' />
      </div>
    );
  }

  return (
    <div className='p-3 border-t-3 border-border'>
      <div className='flex items-center gap-3'>
        <Skeleton className='h-9 w-9 shrink-0' />
        <div className='flex-1 min-w-0 space-y-1.5'>
          <Skeleton className='h-4 w-24' />
          <Skeleton className='h-3 w-16' />
        </div>
      </div>
    </div>
  );
};

export default SidebarUserProfile;

const OfflinePage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center border-3 border-border bg-card p-8 shadow-[4px_4px_0_hsl(var(--neo-shadow))]">
        <div className="text-6xl mb-4" role="img" aria-label="no connection">
          📡
        </div>
        <h1 className="text-2xl font-black tracking-tight mb-2">
          You&apos;re Offline
        </h1>
        <p className="text-muted-foreground mb-6">
          It looks like you&apos;ve lost your internet connection. Check your
          network and try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center px-6 py-3 font-bold border-3 border-border bg-primary text-primary-foreground shadow-[4px_4px_0_hsl(var(--neo-shadow))] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_hsl(var(--neo-shadow))] transition-all"
          aria-label="Retry loading the page"
        >
          Try Again
        </button>
      </div>
    </div>
  );
};

export default OfflinePage;

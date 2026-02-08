import { Suspense } from "react";
import Settings from "@/views/Settings";

// Prevent static prerendering — Settings uses useSearchParams for OAuth callback
export const dynamic = "force-dynamic";

const SettingsPage = () => {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
};

export default SettingsPage;

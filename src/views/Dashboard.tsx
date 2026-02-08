"use client";

import StatCards from "@/components/dashboard/StatCards";
import VolumeChart from "@/components/dashboard/VolumeChart";
import RecentRuns from "@/components/dashboard/RecentRuns";

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight">
        Dashboard
      </h1>
      <StatCards />
      <VolumeChart />
      <RecentRuns />
    </div>
  );
};

export default Dashboard;

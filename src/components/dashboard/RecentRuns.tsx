import { useNavigate } from "react-router-dom";
import { runs, formatPace, formatDuration } from "@/lib/mockData";

const RecentRuns = () => {
  const navigate = useNavigate();

  return (
    <div className="border-3 border-foreground bg-background shadow-neo overflow-hidden">
      <div className="p-5 border-b-3 border-foreground">
        <h3 className="font-black text-lg uppercase tracking-wider">
          Recent Runs
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-3 border-foreground bg-muted">
              <th className="text-left p-3 font-black text-xs uppercase">
                Date
              </th>
              <th className="text-left p-3 font-black text-xs uppercase">
                Name
              </th>
              <th className="text-right p-3 font-black text-xs uppercase">
                Distance
              </th>
              <th className="text-right p-3 font-black text-xs uppercase hidden sm:table-cell">
                Duration
              </th>
              <th className="text-right p-3 font-black text-xs uppercase">
                Pace
              </th>
              <th className="text-right p-3 font-black text-xs uppercase hidden sm:table-cell">
                HR
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 10).map((run) => (
              <tr
                key={run.id}
                onClick={() => navigate(`/activity/${run.id}`)}
                className="border-b-3 border-foreground cursor-pointer hover:bg-accent/20 transition-colors"
              >
                <td className="p-3 font-bold text-sm">
                  {new Date(run.date).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                  })}
                </td>
                <td className="p-3 font-bold text-sm">{run.name}</td>
                <td className="p-3 font-black text-sm text-right">
                  {run.distance.toFixed(1)} km
                </td>
                <td className="p-3 font-bold text-sm text-right hidden sm:table-cell">
                  {formatDuration(run.duration)}
                </td>
                <td className="p-3 font-bold text-sm text-right">
                  {formatPace(run.avgPace)}/km
                </td>
                <td className="p-3 font-bold text-sm text-right hidden sm:table-cell">
                  {run.avgHr} bpm
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RecentRuns;

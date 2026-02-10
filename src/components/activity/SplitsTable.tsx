import { Split, formatPace } from "@/lib/mockData";

interface Props {
  splits: Split[];
}

const SplitsTable = ({ splits }: Props) => {
  return (
    <div className="border-3 border-border bg-background shadow-neo overflow-hidden">
      <div className="p-3 md:p-4 border-b-3 border-border">
        <h3 className="font-black text-base md:text-lg uppercase tracking-wider">Splits</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-3 border-border bg-muted">
              <th className="text-left p-2 md:p-3 font-black text-[10px] md:text-xs uppercase">
                KM
              </th>
              <th className="text-right p-2 md:p-3 font-black text-[10px] md:text-xs uppercase">
                Pace
              </th>
              <th className="text-right p-2 md:p-3 font-black text-[10px] md:text-xs uppercase">
                Avg HR
              </th>
              <th className="text-right p-2 md:p-3 font-black text-[10px] md:text-xs uppercase">
                Elev ↑
              </th>
              <th className="text-right p-2 md:p-3 font-black text-[10px] md:text-xs uppercase hidden md:table-cell">
                Elev ↓
              </th>
            </tr>
          </thead>
          <tbody>
            {splits.map((split) => (
              <tr
                key={split.km}
                className="border-b-3 border-border last:border-b-0"
              >
                <td className="p-2 md:p-3 font-black text-xs md:text-sm">{split.km}</td>
                <td className="p-2 md:p-3 font-bold text-xs md:text-sm text-right">
                  {formatPace(split.pace)}/km
                </td>
                <td className="p-2 md:p-3 font-bold text-xs md:text-sm text-right">
                  {split.avgHr} bpm
                </td>
                <td className="p-2 md:p-3 font-bold text-xs md:text-sm text-right">
                  {split.elevationGain}m
                </td>
                <td className="p-2 md:p-3 font-bold text-xs md:text-sm text-right hidden md:table-cell">
                  {split.elevationLoss}m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SplitsTable;

'use client';

import {useState} from 'react';

type ForecastDay = {
  date: string;
  tempMin: number;
  tempMax: number;
  feelsLikeMax: number;
  feelsLikeMin: number;
  humidityMax: number;
  humidityMin: number;
  condition: string;
  weatherCode: number;
  precipitationMm: number;
  windSpeedMax: number;
  sunrise: string;
  sunset: string;
};

type ApiResponse = {
  city: string;
  coordinates: {lat: number; lon: number};
  days: number;
  provider: string;
  summary: ForecastDay[];
  raw: unknown;
  error?: string;
  detail?: unknown;
};

const DevWeatherPage = () => {
  const [city, setCity] = useState('Rome');
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setElapsed(null);
    const t0 = performance.now();

    try {
      const res = await fetch(`/api/dev/weather?city=${encodeURIComponent(city)}&days=${days}`);
      const data = await res.json();
      setElapsed(Math.round(performance.now() - t0));

      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setResult(data);
        return;
      }

      setResult(data);
    } catch (err) {
      setElapsed(Math.round(performance.now() - t0));
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFetch();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-mono">
      <h1 className="text-2xl font-bold mb-1">Weather API Test</h1>
      <p className="text-zinc-500 text-sm mb-6">
        Dev-only page &mdash; Open-Meteo forecast API (free, no key required)
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div>
          <label htmlFor="city-input" className="block text-xs text-zinc-400 mb-1">
            City
          </label>
          <input
            id="city-input"
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={handleKeyDown}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm w-48 focus:outline-none focus:border-blue-500"
            aria-label="City name"
          />
        </div>

        <div>
          <label htmlFor="days-input" className="block text-xs text-zinc-400 mb-1">
            Days (1-16)
          </label>
          <input
            id="days-input"
            type="number"
            min={1}
            max={16}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            onKeyDown={handleKeyDown}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm w-20 focus:outline-none focus:border-blue-500"
            aria-label="Number of forecast days"
          />
        </div>

        <button
          onClick={handleFetch}
          disabled={loading || !city.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded px-5 py-2 transition-colors"
          aria-label="Fetch weather forecast"
          tabIndex={0}
        >
          {loading ? 'Fetching...' : 'Fetch'}
        </button>

        {elapsed !== null && (
          <span className="text-xs text-zinc-600 self-center">{elapsed} ms</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded p-3 mb-4 text-red-300 text-sm">
          Error: {error}
        </div>
      )}

      {/* Success banner */}
      {result && !error && (
        <div className="bg-green-950 border border-green-800 rounded p-3 mb-4 text-green-300 text-sm">
          <span className="font-medium">{result.city}</span>
          <span className="text-green-500 ml-2 text-xs">
            ({result.coordinates.lat.toFixed(2)}, {result.coordinates.lon.toFixed(2)})
          </span>
          <span className="ml-2">
            &mdash; {result.summary?.length ?? 0} day(s) &mdash; {result.provider}
          </span>
        </div>
      )}

      {/* Summary table */}
      {result?.summary && result.summary.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Forecast Summary</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-zinc-400 border-b border-zinc-800">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Temp</th>
                  <th className="py-2 pr-4">Feels Like</th>
                  <th className="py-2 pr-4">Condition</th>
                  <th className="py-2 pr-4">Humidity</th>
                  <th className="py-2 pr-4">Precip</th>
                  <th className="py-2 pr-4">Wind</th>
                  <th className="py-2 pr-4">Sun</th>
                </tr>
              </thead>
              <tbody>
                {result.summary.map((day) => {
                  const sunriseTime = day.sunrise?.split('T')[1] ?? '';
                  const sunsetTime = day.sunset?.split('T')[1] ?? '';
                  return (
                    <tr key={day.date} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-4 text-zinc-300">{day.date}</td>
                      <td className="py-2 pr-4">
                        {day.tempMin}&ndash;{day.tempMax}&deg;C
                      </td>
                      <td className="py-2 pr-4">
                        {day.feelsLikeMin}&ndash;{day.feelsLikeMax}&deg;C
                      </td>
                      <td className="py-2 pr-4">{day.condition}</td>
                      <td className="py-2 pr-4">
                        {day.humidityMin}&ndash;{day.humidityMax}%
                      </td>
                      <td className="py-2 pr-4">{day.precipitationMm} mm</td>
                      <td className="py-2 pr-4">{day.windSpeedMax.toFixed(1)} m/s</td>
                      <td className="py-2 pr-4 text-xs text-zinc-500">
                        {sunriseTime} / {sunsetTime}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw JSON toggle */}
      {result && (
        <div>
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="text-xs text-zinc-500 hover:text-zinc-300 underline mb-2 transition-colors"
            aria-label={showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
            tabIndex={0}
          >
            {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
          </button>
          {showRaw && (
            <pre className="bg-zinc-900 border border-zinc-800 rounded p-4 text-xs overflow-auto max-h-[60vh]">
              {JSON.stringify(result.raw ?? result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default DevWeatherPage;

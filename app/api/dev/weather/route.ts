import {NextRequest, NextResponse} from 'next/server';

/* ---------- WMO weather code → human label ---------- */
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

/* ---------- Open-Meteo Geocoding ---------- */
type GeoResult = {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
};

const geocodeCity = async (city: string): Promise<GeoResult | null> => {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const r = data.results?.[0];
  if (!r) return null;
  return {
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country ?? '',
    admin1: r.admin1,
  };
};

/* ---------- Open-Meteo Forecast ---------- */
type DailyForecast = {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  weather_code: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  relative_humidity_2m_max: number[];
  relative_humidity_2m_min: number[];
  sunrise: string[];
  sunset: string[];
};

export async function GET(req: NextRequest) {
  const {searchParams} = new URL(req.url);
  const city = searchParams.get('city') || 'Rome';
  const days = Math.min(Math.max(Number(searchParams.get('days') || 3), 1), 16);

  try {
    // 1. Geocode city → lat/lon
    const geo = await geocodeCity(city);
    if (!geo) {
      return NextResponse.json(
        {error: `City "${city}" not found via Open-Meteo geocoding.`},
        {status: 404},
      );
    }

    // 2. Fetch daily forecast from Open-Meteo
    const dailyVars = [
      'temperature_2m_max',
      'temperature_2m_min',
      'apparent_temperature_max',
      'apparent_temperature_min',
      'weather_code',
      'precipitation_sum',
      'wind_speed_10m_max',
      'relative_humidity_2m_max',
      'relative_humidity_2m_min',
      'sunrise',
      'sunset',
    ].join(',');

    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${geo.latitude}&longitude=${geo.longitude}` +
      `&daily=${dailyVars}` +
      `&wind_speed_unit=ms` +
      `&timezone=auto` +
      `&forecast_days=${days}`;

    const res = await fetch(forecastUrl);
    const data = await res.json();

    if (!res.ok || data.error) {
      return NextResponse.json(
        {error: `Open-Meteo error`, detail: data},
        {status: res.status},
      );
    }

    const daily = data.daily as DailyForecast;

    // 3. Build simplified summary
    const summary = daily.time.map((date: string, i: number) => ({
      date,
      tempMin: Math.round(daily.temperature_2m_min[i]),
      tempMax: Math.round(daily.temperature_2m_max[i]),
      feelsLikeMax: Math.round(daily.apparent_temperature_max[i]),
      feelsLikeMin: Math.round(daily.apparent_temperature_min[i]),
      humidityMax: daily.relative_humidity_2m_max[i],
      humidityMin: daily.relative_humidity_2m_min[i],
      condition: WMO_CODES[daily.weather_code[i]] ?? `WMO ${daily.weather_code[i]}`,
      weatherCode: daily.weather_code[i],
      precipitationMm: daily.precipitation_sum[i],
      windSpeedMax: daily.wind_speed_10m_max[i],
      sunrise: daily.sunrise[i],
      sunset: daily.sunset[i],
    }));

    return NextResponse.json({
      city: `${geo.name}${geo.admin1 ? `, ${geo.admin1}` : ''}, ${geo.country}`,
      coordinates: {lat: geo.latitude, lon: geo.longitude},
      days,
      provider: 'Open-Meteo (free, no API key)',
      summary,
      raw: data,
    });
  } catch (err) {
    return NextResponse.json(
      {error: 'Fetch failed', detail: err instanceof Error ? err.message : String(err)},
      {status: 500},
    );
  }
}

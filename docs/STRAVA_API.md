# Strava API Reference — RunZone AI

> Quick-reference for the Strava V3 API endpoints and models used by this app.
> Full docs: https://developers.strava.com/docs/reference/

---

## Authentication (OAuth 2.0)

### Flow

1. **Redirect user** → `https://www.strava.com/oauth/authorize`
2. **User authorises** → redirected back with `?code=XXXX&scope=...`
3. **Exchange code for tokens** → `POST https://www.strava.com/oauth/token`
4. **Refresh when expired** → `POST https://www.strava.com/oauth/token` with `grant_type=refresh_token`

### Authorization URL

```
GET https://www.strava.com/oauth/authorize
  ?client_id={VITE_STRAVA_CLIENT_ID}
  &redirect_uri={VITE_STRAVA_REDIRECT_URI}
  &response_type=code
  &approval_prompt=auto
  &scope=read,activity:read_all,profile:read_all
```

### Scopes Used

| Scope               | Purpose                                              |
|----------------------|------------------------------------------------------|
| `read`               | Public segments, routes, profile, posts, events      |
| `activity:read_all`  | All activities including "Only Me" + privacy zones   |
| `profile:read_all`   | Full profile info including HR zones                 |

### Token Exchange

```
POST https://www.strava.com/oauth/token
Body (form-encoded):
  client_id      = {VITE_STRAVA_CLIENT_ID}
  client_secret  = {STRAVA_CLIENT_SECRET}        ← server-side only
  code           = {authorization_code}
  grant_type     = authorization_code
```

**Response:**
```json
{
  "token_type": "Bearer",
  "expires_at": 1562908002,
  "expires_in": 21600,
  "refresh_token": "REFRESH_TOKEN",
  "access_token": "ACCESS_TOKEN",
  "athlete": { "id": 123456, "firstname": "Marco", ... }
}
```

### Token Refresh

```
POST https://www.strava.com/oauth/token
Body:
  client_id      = {VITE_STRAVA_CLIENT_ID}
  client_secret  = {STRAVA_CLIENT_SECRET}
  refresh_token  = {stored_refresh_token}
  grant_type     = refresh_token
```

---

## Endpoints Used

### 1. Get Authenticated Athlete

```
GET /athlete
Authorization: Bearer {access_token}
```

Returns: `DetailedAthlete` — name, profile picture, city, weight, shoes, bikes, etc.

### 2. Get Athlete Zones (HR + Power)

```
GET /athlete/zones
Authorization: Bearer {access_token}
Scope: profile:read_all
```

Returns: `Zones` — heart_rate zones and power zones with custom/default ranges.

```json
{
  "heart_rate": {
    "custom_zones": true,
    "zones": [
      { "min": 0, "max": 123 },
      { "min": 123, "max": 153 },
      { "min": 153, "max": 169 },
      { "min": 169, "max": 184 },
      { "min": 184, "max": -1 }
    ]
  }
}
```

### 3. List Athlete Activities

```
GET /athlete/activities
  ?before={epoch}
  &after={epoch}
  &page={1}
  &per_page={30}
Authorization: Bearer {access_token}
Scope: activity:read / activity:read_all
```

Returns: `SummaryActivity[]`

Key fields:
- `id`, `name`, `type`, `sport_type`
- `distance` (meters), `moving_time` (seconds), `elapsed_time` (seconds)
- `total_elevation_gain` (meters)
- `start_date`, `start_date_local`, `timezone`
- `average_speed` (m/s), `max_speed` (m/s)
- `has_heartrate`, `average_heartrate`, `max_heartrate`
- `calories` (estimated by Strava)
- `map.summary_polyline`

### 4. Get Activity Detail

```
GET /activities/{id}
  ?include_all_efforts=false
Authorization: Bearer {access_token}
```

Returns: `DetailedActivity` — everything from SummaryActivity plus:
- `description`, `calories`, `device_name`
- `segment_efforts[]`
- `splits_metric[]` — per-km splits with pace, HR, elevation
- `laps[]`
- `best_efforts[]`
- `gear` — shoe/bike used

### 5. Get Activity Streams

```
GET /activities/{id}/streams
  ?keys=time,distance,heartrate,altitude,velocity_smooth,cadence,watts,latlng
  &key_by_type=true
Authorization: Bearer {access_token}
Scope: activity:read / activity:read_all
```

Returns: `StreamSet` — arrays of time-series data:
- `time.data[]` — seconds from start
- `distance.data[]` — meters
- `heartrate.data[]` — bpm
- `altitude.data[]` — meters
- `velocity_smooth.data[]` — m/s
- `latlng.data[]` — [lat, lng] pairs
- `cadence.data[]` — rpm
- `watts.data[]` — watts

### 6. Get Activity Zones

```
GET /activities/{id}/zones
Authorization: Bearer {access_token}
```

Returns: `ActivityZone[]` — time distribution per HR/power zone for the activity.

### 7. Get Athlete Stats

```
GET /athletes/{id}/stats
Authorization: Bearer {access_token}
```

Returns: `ActivityStats`
- `recent_run_totals`, `recent_ride_totals`, `recent_swim_totals`
- `ytd_run_totals`, `ytd_ride_totals`, `ytd_swim_totals`
- `all_run_totals`, `all_ride_totals`, `all_swim_totals`
- `biggest_ride_distance`, `biggest_climb_elevation_gain`

Each total contains: `count`, `distance`, `moving_time`, `elapsed_time`, `elevation_gain`, `achievement_count`.

---

## Key Models

### SummaryActivity

| Field                   | Type    | Unit/Notes        |
|-------------------------|---------|-------------------|
| id                      | long    |                   |
| name                    | string  |                   |
| type                    | string  | "Run", "Ride"...  |
| sport_type              | string  | "Run", "TrailRun" |
| distance                | float   | meters            |
| moving_time             | integer | seconds           |
| elapsed_time            | integer | seconds           |
| total_elevation_gain    | float   | meters            |
| start_date_local        | string  | ISO 8601          |
| average_speed           | float   | m/s               |
| max_speed               | float   | m/s               |
| average_heartrate       | float   | bpm               |
| max_heartrate           | float   | bpm               |
| has_heartrate           | boolean |                   |
| calories                | float   | kcal (estimated)  |
| map.summary_polyline    | string  | encoded polyline  |

### SportType Enum

`AlpineSki`, `BackcountrySki`, `Badminton`, `Canoeing`, `Crossfit`, `EBikeRide`,
`Elliptical`, `EMountainBikeRide`, `Golf`, `GravelRide`, `Handcycle`,
`HighIntensityIntervalTraining`, `Hike`, `IceSkate`, `InlineSkate`, `Kayaking`,
`Kitesurf`, `MountainBikeRide`, `NordicSki`, `Pickleball`, `Pilates`, `Racquetball`,
`Ride`, `RockClimbing`, `RollerSki`, `Rowing`, `Run`, `Sail`, `Skateboard`,
`Snowboard`, `Snowshoe`, `Soccer`, `Squash`, `StairStepper`, `StandUpPaddling`,
`Surfing`, `Swim`, `TableTennis`, `Tennis`, `TrailRun`, `Velomobile`,
`VirtualRide`, `VirtualRow`, `VirtualRun`, `Walk`, `WeightTraining`,
`Wheelchair`, `Windsurf`, `Workout`, `Yoga`

### Split (from DetailedActivity.splits_metric)

| Field                | Type    | Unit    |
|----------------------|---------|---------|
| distance             | float   | meters  |
| elapsed_time         | integer | seconds |
| elevation_difference | float   | meters  |
| moving_time          | integer | seconds |
| average_speed        | float   | m/s     |
| pace_zone            | integer |         |
| split                | integer | index   |

### StreamSet Keys

| Key              | Type          | Description                    |
|------------------|---------------|--------------------------------|
| time             | integer[]     | seconds from start             |
| distance         | float[]       | cumulative meters              |
| latlng           | [lat,lng][]   | GPS coordinates                |
| altitude         | float[]       | meters                         |
| velocity_smooth  | float[]       | m/s (smoothed)                 |
| heartrate        | integer[]     | bpm                            |
| cadence          | integer[]     | rpm                            |
| watts            | integer[]     | watts                          |
| temp             | integer[]     | celsius                        |
| moving           | boolean[]     | is moving?                     |
| grade_smooth     | float[]       | grade percentage               |

---

## Rate Limits

- **100 requests per 15 minutes** per access token
- **1,000 requests per day** per application
- Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Usage`

---

## Mapping SportType → App ActivityType

```typescript
function mapSportType(sportType: string): ActivityType {
  switch (sportType) {
    case "Run":
    case "TrailRun":
    case "VirtualRun":
      return "Run";
    case "Ride":
    case "MountainBikeRide":
    case "GravelRide":
    case "EBikeRide":
    case "EMountainBikeRide":
    case "VirtualRide":
      return "Ride";
    case "Hike":
      return "Hike";
    case "Swim":
      return "Swim";
    default:
      return "Run"; // fallback
  }
}
```

---

## Data Transformation: Strava → App

```
SummaryActivity → ActivitySummary
  id             → id (as string)
  name           → name
  start_date_local → date (YYYY-MM-DD)
  sport_type     → type (mapped via mapSportType)
  distance / 1000 → distance (km)
  moving_time    → duration (seconds)
  moving_time > 0 ? (moving_time / 60) / (distance / 1000) : 0 → avgPace (min/km)
  average_heartrate → avgHr
  max_heartrate  → maxHr
  total_elevation_gain → elevationGain
  calories       → calories
  true           → hasDetailedData (always true for real data)
```

```
StreamSet → StreamPoint[]
  Zip time, distance, velocity_smooth, heartrate, altitude arrays into objects.
```

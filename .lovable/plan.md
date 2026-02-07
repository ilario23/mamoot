

# RunTeam AI — V2 Advanced Dashboard & Settings

A bold, multi-page running analytics app with a Neo-Brutalist visual identity, featuring data visualization, synced activity charts, and a mock AI coaching team.

---

## 🎨 Design System: Neo-Brutalism

- **Font:** Space Grotesk (Bold/Black for headings, Medium for body)
- **Colors:** Pure white backgrounds, solid black borders (3px), vibrant flat accents — Magenta (#FF58E5) as primary accent, Electric Blue (#3B82F6), Bright Yellow (#FACC15)
- **Components:** Thick black borders on every card/button/input. Hard offset drop shadows (no blur). Mix of sharp rectangles and pill-shaped buttons/tags. Large, heavy typography throughout
- **No gradients, no soft shadows** — everything is flat and bold

---

## 📐 Layout Structure

- **Desktop:** Persistent left sidebar with navigation icons (Dashboard, Settings) and the AI Team chat selector. Main content area changes by route
- **Mobile:** Sidebar replaced with a bottom tab bar for Dashboard, Settings, and AI Team access
- A header with a sidebar toggle trigger on desktop

---

## 📊 Page 1: Dashboard (`/`)

- **Summary Cards Row:** Three chunky stat cards with thick black borders showing:
  - Weekly running volume (km + time)
  - Acute Training Load (7-day vs rolling average)
  - Estimated VO2 Max
- **4-Week Volume Chart:** Stacked bar chart (Recharts) where each segment is colored by HR Zone using flat Neo-Brutalist accent colors. Solid black grid lines, no curved edges
- **Recent Runs Table:** Clickable list of runs with bold text, heavy row borders, and key stats (date, distance, pace, HR). Clicking a row navigates to the activity detail

---

## 🏃 Page 2: Activity Detail (`/activity/:id`)

- **Run Header:** Large blocky containers showing run name, date, and big summary stats (distance, duration, avg pace, avg HR, elevation gain)
- **Map Placeholder:** A large bordered container with "Map Visualization" label
- **3 Synchronized Charts:** Stacked vertically, sharing the same time/distance X-axis:
  1. **Pace** — thick line chart with flat accent color
  2. **Heart Rate** — line chart with HR zone backgrounds as solid flat color bands
  3. **Elevation Profile** — area/line chart
- **Splits Table:** Per-kilometer breakdown with heavy borders showing pace, HR, elevation for each split

---

## ⚙️ Page 3: Settings (`/settings`)

- **HR Zone Configuration:**
  - Input fields for Maximum HR and Resting HR with thick black borders
  - 5 zone editors (dual inputs or visual range sliders) with chunky, accent-colored handles
  - Each zone labeled (Z1–Z5) with its corresponding flat accent color
- **Save Button:** Large pill-shaped button with a hard black offset shadow
- Settings are stored in local state (mock data layer) and reflected in dashboard charts

---

## 🤖 AI Team (Sidebar Widget)

- **3 Personas:** Coach, Nutritionist, Physio — each selectable via bold pill-shaped buttons with thick borders. Active persona gets a solid accent-color fill
- **Chat Panel:** A raw, high-contrast conversation feed in the sidebar. Pre-written mock responses per persona based on recent run context
- **Mobile:** Accessible via the bottom tab bar, opening a full-screen chat view

---

## 🗂️ Mock Data Layer

- `src/lib/mockData.ts` containing:
  - 20 recent runs with summary stats (distance, time, pace, HR, date, elevation)
  - Detailed time-series streams for 3 runs (time, distance, velocity, heartrate, altitude at 10-second intervals)
  - User settings object with HR zones and max/resting HR defaults
- All data is client-side only — no backend needed

---

## 🧭 Routing

- `/` → Dashboard
- `/activity/:id` → Activity Detail
- `/settings` → Settings
- 404 catch-all page


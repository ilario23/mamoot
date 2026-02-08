import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-space-grotesk)", '"Space Grotesk"', "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        nav: {
          dashboard: {
            DEFAULT: "hsl(var(--nav-dashboard))",
            foreground: "hsl(var(--nav-dashboard-foreground))",
          },
          calendar: {
            DEFAULT: "hsl(var(--nav-calendar))",
            foreground: "hsl(var(--nav-calendar-foreground))",
          },
          activities: {
            DEFAULT: "hsl(var(--nav-activities))",
            foreground: "hsl(var(--nav-activities-foreground))",
          },
          records: {
            DEFAULT: "hsl(var(--nav-records))",
            foreground: "hsl(var(--nav-records-foreground))",
          },
          ai: {
            DEFAULT: "hsl(var(--nav-ai))",
            foreground: "hsl(var(--nav-ai-foreground))",
          },
        },
        zone: {
          1: "hsl(var(--zone-1))",
          2: "hsl(var(--zone-2))",
          3: "hsl(var(--zone-3))",
          4: "hsl(var(--zone-4))",
          5: "hsl(var(--zone-5))",
        },
      },
      borderWidth: {
        "3": "3px",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        neo: "4px 4px 0px 0px hsl(var(--neo-shadow))",
        "neo-sm": "2px 2px 0px 0px hsl(var(--neo-shadow))",
        "neo-lg": "6px 6px 0px 0px hsl(var(--neo-shadow))",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

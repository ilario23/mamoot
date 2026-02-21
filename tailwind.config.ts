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
        page: {
          DEFAULT: "hsl(var(--page-accent))",
          foreground: "hsl(var(--page-accent-foreground))",
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
          segments: {
            DEFAULT: "hsl(var(--nav-segments))",
            foreground: "hsl(var(--nav-segments-foreground))",
          },
          ai: {
            DEFAULT: "hsl(var(--nav-ai))",
            foreground: "hsl(var(--nav-ai-foreground))",
          },
          gear: {
            DEFAULT: "hsl(var(--nav-gear))",
            foreground: "hsl(var(--nav-gear-foreground))",
          },
          "weekly-plan": {
            DEFAULT: "hsl(var(--nav-weekly-plan))",
            foreground: "hsl(var(--nav-weekly-plan-foreground))",
          },
          "training-block": {
            DEFAULT: "hsl(var(--nav-training-block))",
            foreground: "hsl(var(--nav-training-block-foreground))",
          },
          more: {
            DEFAULT: "hsl(var(--nav-more))",
            foreground: "hsl(var(--nav-more-foreground))",
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
        "neo-inset": "inset 2px 2px 0px 0px hsl(var(--neo-shadow) / 0.08)",
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
        "neo-pulse-border": {
          "0%, 100%": { borderColor: "hsl(var(--border))" },
          "50%": { borderColor: "hsl(var(--primary))" },
        },
        "neo-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(200%)" },
        },
        "neo-blink": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          "0%": { opacity: "0", transform: "translateX(-12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(12px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "bounce-in": {
          "0%": { opacity: "0", transform: "scale(0.6)" },
          "50%": { transform: "scale(1.08)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "neo-shimmer": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
        "neo-blocks": {
          "0%, 100%": { transform: "scaleY(0.4)", opacity: "0.4" },
          "50%": { transform: "scaleY(1)", opacity: "1" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "neo-pulse": "neo-pulse-border 2s ease-in-out infinite",
        "neo-progress": "neo-indeterminate 1.5s ease-in-out infinite",
        "neo-blink": "neo-blink 1s step-end infinite",
        "neo-shimmer": "neo-shimmer 1.8s ease-in-out infinite",
        "neo-blocks": "neo-blocks 0.8s ease-in-out infinite",
        "fade-in-up": "fade-in-up 0.3s ease-out both",
        "slide-in-left": "slide-in-left 0.25s ease-out both",
        "slide-in-right": "slide-in-right 0.25s ease-out both",
        "bounce-in": "bounce-in 0.4s ease-out both",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/typography"),
  ],
} satisfies Config;

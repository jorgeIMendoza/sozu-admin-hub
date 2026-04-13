import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
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
        sans: ["-apple-system", "BlinkMacSystemFont", "SF UI Text", "Helvetica Neue", "Arial", "sans-serif"],
        display: ["-apple-system", "BlinkMacSystemFont", "SF UI Text", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        "border-light": "hsl(var(--border-light, 220 14% 96%))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
          hover: "hsl(var(--primary-hover))",
          dark: "hsl(var(--primary-dark, 158 64% 32%))",
          light: "hsl(var(--primary-light, 138 76% 93%))",
          muted: "hsl(var(--primary-muted, 138 76% 97%))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          bg: "hsl(var(--success-bg, 138 76% 93%))",
        },
        admin: {
          sidebar: "hsl(var(--admin-sidebar))",
          "sidebar-foreground": "hsl(var(--admin-sidebar-foreground))",
          "sidebar-accent": "hsl(var(--admin-sidebar-accent))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          bg: "hsl(var(--warning-bg, 48 96% 89%))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger, 0 84% 60%))",
          bg: "hsl(var(--danger-bg, 0 93% 94%))",
        },
        info: {
          DEFAULT: "hsl(var(--info, 217 91% 60%))",
          bg: "hsl(var(--info-bg, 214 95% 93%))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          light: "hsl(var(--accent-light, 145 35% 96%))",
          glow: "hsl(var(--accent-glow, 145 38% 42%))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        priority: {
          green: "hsl(var(--priority-green, 142 71% 45%))",
          yellow: "hsl(var(--priority-yellow, 38 92% 50%))",
          red: "hsl(var(--priority-red, 0 84% 60%))",
          purple: "hsl(var(--priority-purple, 270 50% 45%))",
          blue: "hsl(var(--priority-blue, 217 91% 60%))",
          gray: "hsl(var(--priority-gray, 218 11% 65%))",
        },
        navy: {
          DEFAULT: "hsl(var(--navy, 0 0% 8%))",
          mid: "hsl(var(--navy-mid, 0 0% 15%))",
          light: "hsl(var(--navy-light, 0 0% 25%))",
        },
        emerald: {
          DEFAULT: "hsl(var(--emerald, 145 35% 51%))",
          light: "hsl(var(--emerald-light, 145 35% 62%))",
          pale: "hsl(var(--emerald-pale, 145 40% 95%))",
        },
        gold: { DEFAULT: "hsl(var(--gold, 42 80% 55%))" },
        sozu: {
          black: "hsl(var(--sozu-black, 0 0% 5%))",
          green: "hsl(var(--sozu-green, 145 35% 51%))",
          "green-light": "hsl(var(--sozu-green-light, 139 35% 96%))",
          "green-dark": "hsl(var(--sozu-green-dark, 139 35% 38%))",
          gray: "hsl(var(--sozu-gray, 0 0% 34%))",
          "gray-light": "hsl(var(--sozu-gray-light, 0 0% 93%))",
          "gray-muted": "hsl(var(--sozu-gray-muted, 0 0% 60%))",
          white: "hsl(var(--sozu-white, 0 0% 100%))",
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
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-md": "var(--shadow-md)",
        accent: "var(--shadow-accent)",
      },
      backgroundImage: {
        "gradient-hero": "var(--gradient-hero)",
        "gradient-accent": "var(--gradient-accent)",
        "gradient-section": "var(--gradient-section)",
        "gradient-card": "var(--gradient-card)",
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
        "fade-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.6s ease forwards",
        "fade-in": "fade-in 0.4s ease forwards",
        float: "float 4s ease-in-out infinite",
        "scale-in": "scale-in 0.5s ease forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;

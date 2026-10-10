/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        studio: {
          950: "#0b0d10",
          900: "#101317",
          850: "#14181d",
          800: "#1a1f26",
          700: "#242b34",
          600: "#323b46",
          500: "#46525f",
          400: "#6b7a89",
          300: "#9aa8b6",
          200: "#c7d1db",
          100: "#e7edf3",
        },
        toxic: { 400: "#ff5c6c", 500: "#e8384f", 600: "#b91c33" },
        spoiler: { 400: "#b57aff", 500: "#8b46d9", 600: "#6d2fb0" },
        question: { 400: "#3ddc91", 500: "#1fb871", 600: "#148a55" },
        spam: { 400: "#9aa8b6", 500: "#7a8894", 600: "#5d6a76" },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
      },
    },
  },
  plugins: [],
};

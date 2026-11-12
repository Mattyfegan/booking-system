/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Riverside Barbers brand. Gold is for accents (borders, rings, soft fills); green carries text and primary actions.
        brand: {
          gold: { DEFAULT: "#C5A059", soft: "#F7F0E1" },
          green: { DEFAULT: "#1B3A2E", dark: "#142C23" },
        },
      },
    },
  },
  plugins: [],
};

import coreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  { ignores: [".next/**", "next-env.d.ts"] },
  ...coreWebVitals,
  {
    rules: {
      // New in eslint-plugin-react-hooks v6 (bundled with eslint-config-next 16). Flags existing
      // reset-on-change effects in booking-panel.tsx and site-navbar.tsx; kept as a warning until refactored.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default config;

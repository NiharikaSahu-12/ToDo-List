import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{html,js,svelte,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#171717",
        muted: "#737373",
        canvas: "#f7f7f5",
        accent: "#6d5efc",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 20px 60px rgba(24, 24, 27, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;

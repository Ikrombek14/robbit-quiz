/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        "primary-strong": "var(--primary-strong)",
        "primary-soft": "var(--primary-soft)",
        accent: "var(--accent)",
        olive: "var(--olive)",
        navy: "var(--navy)",
      },
      fontFamily: {
        head: ["Inter", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
};

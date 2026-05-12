import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: "#FAF8F4",
        "cream-dark": "#F0EDE6",
        nbis: "#1D9E75",
        cifr: "#378ADD",
        iren: "#D85A30",
      },
    },
  },
  plugins: [],
};
export default config;

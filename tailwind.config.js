/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          pink: '#E83E8C',
          blue: '#1976D2',
          yellow: '#FFC107',
          dark: '#0f172a'
        }
      }
    },
  },
  plugins: [],
}

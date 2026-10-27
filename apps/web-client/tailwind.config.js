/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#202124',
        muted: '#74777f',
        line: '#E2E8F0',
        canvas: '#f7f7f8',
        brand: { 50: '#fff3f2', 100: '#ffe5e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#be211e', 600: '#a91517', 700: '#861116', 800: '#6f1014', 900: '#531012' },
      },
      boxShadow: { soft: '0 1px 3px rgba(15, 23, 42, .06)' },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};

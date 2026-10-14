/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#202124',
        muted: '#74777f',
        line: '#e9e9eb',
        canvas: '#f7f7f8',
        brand: { 50: '#fff3f2', 100: '#ffe5e2', 500: '#be211e', 600: '#a91517', 700: '#861116', 900: '#531012' },
      },
      boxShadow: { soft: '0 8px 30px rgba(31, 25, 25, .055)' },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};

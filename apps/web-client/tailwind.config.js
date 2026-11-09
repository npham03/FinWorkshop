/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#202124',
        muted: '#5f6368',
        line: '#E2E8F0',
        canvas: '#f6f5f3',
        brand: { 50: '#fff3f2', 100: '#ffe5e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#be211e', 600: '#a91517', 700: '#861116', 800: '#6f1014', 900: '#531012' },
      },
      fontSize: { xs: ['0.875rem', '1.35rem'], sm: ['1rem', '1.5rem'], base: ['1.0625rem', '1.6rem'], lg: ['1.25rem', '1.75rem'], xl: ['1.5rem', '2rem'], '2xl': ['1.75rem', '2.25rem'], '3xl': ['2rem', '2.5rem'] },
      boxShadow: { soft: '0 1px 2px rgba(15, 23, 42, .04), 0 6px 18px -8px rgba(15, 23, 42, .10)', lift: '0 12px 28px -12px rgba(169, 21, 23, .30)', pop: '0 24px 60px -20px rgba(15, 23, 42, .35)' },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem', '3xl': '1.75rem' },
      fontFamily: { sans: ['Inter', 'Segoe UI', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};

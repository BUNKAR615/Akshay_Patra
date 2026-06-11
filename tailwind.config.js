/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand scales — class-side mirror of components/ui/tokens.js (JS side).
        'ap-blue': {
          DEFAULT: '#003087',
          900: '#001A4D',
          800: '#001F5C',
          700: '#002266',
          600: '#0A3FA0',
          500: '#1D54B8',
          100: '#DCE6F7',
          50: '#EEF3FB',
        },
        'ap-green': {
          DEFAULT: '#00843D',
          700: '#006B32',
          600: '#0A9B4E',
          100: '#D2EEDF',
          50: '#EBF7F1',
        },
        'ap-orange': {
          DEFAULT: '#F7941D',
          700: '#C2410C',
          600: '#D87A0A',
          100: '#FDE7CB',
          50: '#FEF4E8',
        },
        'ap-dark': '#0D1B3E',
        // Semantic tokens — single source for surfaces/borders/text.
        'ap-surface': '#FFFFFF',
        'ap-bg': '#F4F6FA',
        'ap-border': {
          DEFAULT: '#E4E7ED',
          strong: '#CBD2DC',
        },
        'ap-text': {
          DEFAULT: '#1E293B',
          muted: '#64748B',
          faint: '#94A3B8',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(13, 27, 62, 0.05)',
        'card-hover': '0 4px 12px rgba(13, 27, 62, 0.08)',
        pop: '0 8px 30px rgba(13, 27, 62, 0.12)',
      },
      borderRadius: {
        card: '14px',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

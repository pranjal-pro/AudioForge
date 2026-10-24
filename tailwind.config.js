/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forge: {
          bg: '#0a0a0f',
          surface: '#15131f',
          card: '#1c1929',
          border: '#2a2638',
          'border-hover': '#3d3a52',
          accent: '#a855f7',
          'accent-hover': '#9333ea',
          'accent-dim': '#7c3aed',
          'accent-light': '#c084fc',
          text: '#e5e4eb',
          'text-muted': '#a0a0b0',
          'text-dim': '#76748a',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

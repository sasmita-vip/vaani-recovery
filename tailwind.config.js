/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Warm chocolate accents: "indigo-*" utilities are remapped so the
        // existing components pick up the ivory + chocolate palette.
        indigo: {
          50: '#f8f1e6',
          100: '#f1e3d0',
          200: '#e4cbb0',
          300: '#d2ae8c',
          400: '#bb8d66',
          500: '#9c6f45',
          600: '#7a4f2a',
          700: '#653f21',
          800: '#52331b',
          900: '#3f2714',
          950: '#2b1a0d',
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        // semantic token palette mapping to CSS vars
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        'content-strong': 'rgb(var(--content-strong) / <alpha-value>)',
        content: 'rgb(var(--content) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(74 46 25 / 0.05), 0 1px 3px 0 rgb(74 46 25 / 0.07)',
        'card-lg': '0 4px 6px -1px rgb(74 46 25 / 0.07), 0 2px 4px -2px rgb(74 46 25 / 0.06)',
        'card-xl': '0 12px 24px -4px rgb(74 46 25 / 0.1), 0 4px 8px -2px rgb(74 46 25 / 0.05)',
        pop: '0 12px 32px -4px rgb(42 25 13 / 0.18), 0 4px 12px -2px rgb(42 25 13 / 0.1)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.6' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};

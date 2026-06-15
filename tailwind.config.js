/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens do tema (definidos em src/index.css — claro em :root, escuro em .dark)
        app: {
          bg: 'var(--bg)',
          surface: 'var(--surface)',
          surface2: 'var(--surface-2)',
          surface3: 'var(--surface-3)',
          sidebar: 'var(--sidebar)',
          hover: 'var(--hover)',
          active: 'var(--active)',
        },
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        ink: {
          DEFAULT: 'var(--text)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          text: 'var(--accent-text)',
          on: 'var(--on-accent)',
        },
        brand: {
          400: '#F6B73C',
          500: '#E89B16',
          600: '#c47c08',
        },
      },
    },
  },
  plugins: [],
}

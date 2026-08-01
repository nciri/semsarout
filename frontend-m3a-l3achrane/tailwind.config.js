/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: 'var(--brand-primary)',
        gold: 'var(--brand-accent)',
        verified: 'var(--verified)',
      },
      fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)' },
    },
  },
  plugins: [],
}

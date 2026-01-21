/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Couleurs inspirées du Maroc
        primary: {
          50: '#fdf4f3',
          100: '#fce7e4',
          200: '#fad3cd',
          300: '#f5b3a9',
          400: '#ed877a',
          500: '#e15d4e',  // Rouge marocain principal
          600: '#cd4132',
          700: '#ac3427',
          800: '#8e2e24',
          900: '#762b24',
          950: '#40130e',
        },
        secondary: {
          50: '#f0fdf5',
          100: '#dcfce8',
          200: '#bbf7d1',
          300: '#86efad',
          400: '#4ade80',
          500: '#22c55e',  // Vert
          600: '#16a34a',
          700: '#15803c',
          800: '#166533',
          900: '#14532b',
          950: '#052e14',
        },
        terracotta: {
          50: '#fdf6ef',
          100: '#fbebd9',
          200: '#f6d4b1',
          300: '#f0b780',
          400: '#e9914d',
          500: '#e47529',  // Terracotta
          600: '#d55c1f',
          700: '#b1451b',
          800: '#8d391d',
          900: '#72311b',
          950: '#3d160b',
        },
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',  // Or marocain
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

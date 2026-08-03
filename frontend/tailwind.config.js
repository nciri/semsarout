/** @type {import('tailwindcss').Config} */
// Palette issue du design system "SemsarOut Design System" (claude.ai/design).
// Marque : Midnight + Ivory + Or (primaire) + Émeraude (secondaire) + rouge
// profond "carton rouge" (signature du "Out").
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        midnight: '#0B1220',
        ivory: '#FAF9F7',
        // primary = ramp OR (accent principal de la marque)
        primary: {
          50: '#FBF5EA',
          100: '#F4E4C6',
          200: '#EDD4A8',
          300: '#E4C489',
          400: '#D6A85F',  // base
          500: '#D6A85F',
          600: '#C6923F',  // hover
          700: '#A9781F',  // pressed
          800: '#8A6218',
          900: '#6B4C12',
          950: '#3B2A0A',
        },
        // secondary + emerald = ramp ÉMERAUDE
        emerald: {
          50: '#E7F3F1',
          100: '#C3E2DD',
          200: '#9ED0C9',
          300: '#6BB5AC',
          400: '#3D958B',
          500: '#0F766E',  // base
          600: '#0B5C55',  // hover
          700: '#083F3A',  // pressed
          800: '#06302C',
          900: '#04211E',
        },
        secondary: {
          50: '#E7F3F1',
          100: '#C3E2DD',
          200: '#9ED0C9',
          300: '#6BB5AC',
          400: '#3D958B',
          500: '#0F766E',
          600: '#0B5C55',
          700: '#083F3A',
          800: '#06302C',
          900: '#04211E',
        },
        // rouge "carton rouge" — accent signature, plus profond qu'un rouge alerte
        redcard: {
          50: '#FBEAEC',
          100: '#F5CBCF',
          300: '#E06A73',
          500: '#C1121F',
          600: '#A50E1A',
          700: '#870B15',
        },
        // terracotta héritée → remappée sur la ramp or pour garder la cohérence
        terracotta: {
          50: '#FBF5EA',
          100: '#F4E4C6',
          200: '#EDD4A8',
          300: '#E4C489',
          400: '#D6A85F',
          500: '#D6A85F',
          600: '#C6923F',
          700: '#A9781F',
          800: '#8A6218',
          900: '#6B4C12',
          950: '#3B2A0A',
        },
        gold: {
          50: '#FBF5EA',
          100: '#F4E4C6',
          200: '#EDD4A8',
          300: '#E4C489',
          400: '#D6A85F',
          500: '#C6923F',
          600: '#A9781F',
          700: '#8A6218',
          800: '#6B4C12',
          900: '#4C360D',
          950: '#3B2A0A',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        'ds-sm': '8px',   // inputs, badges, petits boutons
        'ds-md': '16px',  // boutons, cartes
        'ds-lg': '20px',  // grandes cartes, médias
        'ds-xl': '28px',  // panneaux héro, modales
      },
      boxShadow: {
        'ds-sm': '0 1px 3px rgba(11,18,32,.06), 0 1px 2px rgba(11,18,32,.04)',
        'ds-md': '0 4px 12px rgba(11,18,32,.07)',
        'ds-lg': '0 12px 24px rgba(11,18,32,.09)',
        'ds-xl': '0 24px 48px rgba(11,18,32,.12)',
        'gold': '0 10px 26px rgba(214,168,95,.38)',
        'red': '0 10px 26px rgba(193,18,31,.34)',
        'emerald-glow': '0 10px 26px rgba(15,118,110,.30)',
      },
    },
  },
  plugins: [],
}

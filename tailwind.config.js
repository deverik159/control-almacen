/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        acero: {
          50: '#f6f7f8', 100: '#e9ebee', 200: '#d3d7dd',
          600: '#4b5563', 800: '#232a33', 900: '#161b21', 950: '#0e1116',
        },
        ambar: { 400: '#f5b301', 500: '#e0a300' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}

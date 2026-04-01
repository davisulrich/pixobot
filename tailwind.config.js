/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#F8F7F5',
        surface: '#FFFFFF',
        'surface-muted': '#F0EEE9',
        border: '#E5E2DB',
        'text-primary': '#1A1815',
        'text-secondary': '#8A8580',
        'text-tertiary': '#B8B4AE',
        accent: '#F5C842',
        'accent-dark': '#1A1815',
        destructive: '#D94F4F',
      },
    },
  },
  plugins: [],
};

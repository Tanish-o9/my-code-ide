/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#1e1e1e',
          sidebar: '#252526',
          activity: '#333333',
          status: '#007acc',
          terminal: '#1e1e1e',
          activeTab: '#1e1e1e',
          inactiveTab: '#2d2d2d',
          border: '#3c3c3c',
          text: '#d4d4d4',
          accent: '#007acc',
        }
      }
    },
  },
  plugins: [],
}

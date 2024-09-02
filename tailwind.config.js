/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/*/.{js,jsx,ts,tsx}",
  ],
  theme: {
    screens:{

      'xs':'320px',
      'lg':'1024px',
      'md':'768px',
      'sm':'640px',
      'xl':'1440px'
    },
    extend: {
  
   
    },
  },
  plugins: [],
}
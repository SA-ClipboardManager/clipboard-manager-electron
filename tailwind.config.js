/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/src/**/*.{html,js,jsx,ts,tsx}', './src/**/index.html'],
  theme: {
    extend: {
      fontFamily: {
        pretendard: ['Pretendard', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

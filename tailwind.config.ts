import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
    './store/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        accent: 'var(--accent)',
        'accent-a': 'var(--accent-a)',
        'accent-b': 'var(--accent-b)',
        'accent-fg': 'var(--accent-fg)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
      },
      fontFamily: {
        display: ['var(--font-sora)', 'var(--font-inter)', 'Noto Sans Bengali', 'sans-serif'],
        sans: ['var(--font-inter)', 'Noto Sans Bengali', 'system-ui', 'sans-serif'],
        bengali: ['Noto Sans Bengali', 'var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        sm: 'var(--radius-sm, 10px)',
        md: 'var(--radius-md, 14px)',
        lg: 'var(--radius-lg, 20px)',
        xl: 'var(--radius-xl, 28px)',
        full: 'var(--radius-full, 9999px)',
        custom: 'var(--radius-md, 14px)',
      },
      boxShadow: {
        pop: 'var(--shadow-pop)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      transitionTimingFunction: {
        custom: 'var(--ease)',
        spring: 'var(--ease-spring)',
      },
      transitionDuration: {
        fast: 'var(--d-fast)',
        base: 'var(--d-base)',
        slow: 'var(--d-slow)',
      },
    },
  },
  plugins: [],
};

export default config;

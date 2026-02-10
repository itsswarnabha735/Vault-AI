import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Obsidian & Gold Design System
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Vault Design System - Background Scale
        vault: {
          'bg-primary': '#0A0C10',
          'bg-secondary': '#12151C',
          'bg-tertiary': '#1A1E28',
          'bg-elevated': '#1E2330',
          'bg-surface': '#242938',
          'bg-hover': '#2A3042',
          // Accent Gold
          gold: '#C8A44E',
          'gold-secondary': '#D4B86A',
          'gold-muted': 'rgba(200,164,78,0.15)',
          'gold-glow': 'rgba(200,164,78,0.08)',
          // Text
          'text-primary': '#E8ECF4',
          'text-secondary': '#8B92A5',
          'text-tertiary': '#5C6378',
          // Semantic
          success: '#34D399',
          'success-muted': 'rgba(52,211,153,0.12)',
          'success-text': '#6EE7B7',
          warning: '#FBBF24',
          'warning-muted': 'rgba(251,191,36,0.12)',
          'warning-text': '#FCD34D',
          danger: '#F87171',
          'danger-muted': 'rgba(248,113,113,0.12)',
          'danger-text': '#FCA5A5',
          info: '#60A5FA',
          'info-muted': 'rgba(96,165,250,0.12)',
          'info-text': '#93C5FD',
        },
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        full: '9999px',
      },
      fontFamily: {
        sans: ['var(--font-dm-sans)', 'Helvetica Neue', 'sans-serif'],
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
        mono: ['var(--font-jetbrains)', 'Fira Code', 'monospace'],
      },
      fontSize: {
        // Design System Type Scale
        'display': ['48px', { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'h1': ['32px', { lineHeight: '1.3', letterSpacing: '-0.02em', fontWeight: '600' }],
        'h2': ['22px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'h3': ['16px', { lineHeight: '1.3', letterSpacing: '0', fontWeight: '600' }],
        'body': ['14px', { lineHeight: '1.6', letterSpacing: '0', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.6', letterSpacing: '0.01em', fontWeight: '400' }],
        'label': ['12px', { lineHeight: '1.6', letterSpacing: '0.03em', fontWeight: '500' }],
        'mono-data': ['13px', { lineHeight: '1.6', letterSpacing: '0.02em', fontWeight: '500' }],
      },
      spacing: {
        // Design System 4px base
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '9': '36px',
        '10': '40px',
        '11': '44px',
        '12': '48px',
        '14': '56px',
        '16': '64px',
        '20': '80px',
      },
      boxShadow: {
        'sm': '0 1px 3px rgba(0,0,0,0.4)',
        'md': '0 4px 16px rgba(0,0,0,0.5)',
        'lg': '0 12px 40px rgba(0,0,0,0.6)',
        'glow': '0 0 30px rgba(200,164,78,0.1)',
        'inner': 'inset 0 1px 0 rgba(255,255,255,0.04)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-out': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
        'slide-in-from-top': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-in-from-bottom': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'slide-in-from-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'slide-in-from-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'vault-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-out': 'fade-out 0.2s ease-out',
        'slide-in-from-top': 'slide-in-from-top 0.3s ease-out',
        'slide-in-from-bottom': 'slide-in-from-bottom 0.3s ease-out',
        'slide-in-from-left': 'slide-in-from-left 0.3s ease-out',
        'slide-in-from-right': 'slide-in-from-right 0.3s ease-out',
        'spin-slow': 'spin-slow 3s linear infinite',
        pulse: 'pulse 1.5s ease-in-out infinite',
        'vault-pulse': 'vault-pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;

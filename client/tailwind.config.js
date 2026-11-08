/**
 * SpendWise — Centralized Tailwind Configuration & Design Token Architecture
 *
 * CANONICAL SOURCE OF TRUTH:
 * This file serves as the canonical source of truth for all Tailwind utility
 * token scales: screens/breakpoints, colors, spacing (numeric 4px-grid & semantic),
 * typography, font weights, line heights, letter spacings, sizing dimensions
 * (width, height, min/maxWidth, min/maxHeight), borders, radii, shadows, z-index,
 * backdrop blur, transitions, and animations.
 *
 * Runtime CSS custom properties in `client/src/index.css` (:root) mirror these values
 * for `@layer base` defaults, runtime CSS inheritance, and design-token test contracts.
 */

const DANGER_SCALE = {
  DEFAULT: '#dc2626',
  bg: '#fee2e2',
  hover: '#fecaca',
  border: '#fecaca',
  text: '#b91c1c',
  accent: '#dc2626',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: '420px',
        mobile: '540px',
        tablet: '840px',
        desktop: '1120px',
      },
      backdropBlur: {
        xs: '2px',
        glass: '16px',
      },
      colors: {
        brand: {
          DEFAULT: '#09090b',
          hover: '#27272a',
          light: '#bae6fd',
        },
        surface: {
          DEFAULT: '#ffffff',
          subtle: '#f8fafc',
          muted: '#f1f5f9',
          hover: '#e2e8f0',
          glass: 'rgba(255, 255, 255, 0.72)',
        },
        content: {
          primary: '#0f172a',
          secondary: '#334155',
          muted: '#64748b',
          inverse: '#ffffff',
        },
        border: {
          DEFAULT: '#e2e8f0',
          hover: '#64748b',
          glass: 'rgba(255, 255, 255, 0.8)',
        },
        success: {
          DEFAULT: '#16a34a',
          bg: '#dcfce7',
          border: '#bbf7d0',
          text: '#15803d',
          accent: '#16a34a',
        },
        danger: { ...DANGER_SCALE },
        error: { ...DANGER_SCALE },
        warning: {
          DEFAULT: '#d97706',
          bg: '#fef3c7',
          border: '#fde68a',
          text: '#d97706',
          accent: '#d97706',
        },
        info: {
          DEFAULT: '#0284c7',
          bg: '#e0f2fe',
          border: '#bae6fd',
          text: '#0369a1',
          accent: '#0284c7',
        },
        income: {
          DEFAULT: '#15803d',
          bg: '#dcfce7',
          border: '#bbf7d0',
          text: '#15803d',
          accent: '#16a34a',
        },
        expense: {
          DEFAULT: '#b91c1c',
          bg: '#fee2e2',
          border: '#fecaca',
          text: '#b91c1c',
          accent: '#dc2626',
        },
        sidebar: {
          DEFAULT: '#09090b',
          surface: 'rgba(9, 9, 11, 0.88)',
          fg: '#ffffff',
          muted: '#cbd5e1',
          active: 'rgba(255, 255, 255, 0.16)',
          hover: 'rgba(255, 255, 255, 0.1)',
          border: 'rgba(255, 255, 255, 0.22)',
          avatar: 'rgba(255, 255, 255, 0.2)',
        },
        overlay: {
          DEFAULT: 'rgba(15, 23, 42, 0.5)',
          blur: 'rgba(15, 23, 42, 0.4)',
          dark: 'rgba(0, 0, 0, 0.7)',
        },
      },
      spacing: {
        '0': '0px',
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '3.5': '14px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '14': '56px',
        '18': '72px',
        fab: '54px',
        none: '0px',
        '2xs': '2px',
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
      },
      width: {
        sidebar: '280px',
        'sidebar-compact': '178px',
        'push-drawer': '410px',
        'push-drawer-max': 'min(760px, 100vw)',
        drawer: '720px',
        workspace: '1340px',
        fab: '54px',
        'page-jump': '72px',
      },
      height: {
        fab: '54px',
        chart: '180px',
      },
      minWidth: {
        table: '740px',
      },
      maxWidth: {
        workspace: '1340px',
        'push-drawer-max': 'min(760px, 100vw)',
        'modal-sm': '400px',
        'modal-md': '520px',
        'modal-lg': '620px',
        'modal-xl': '760px',
        'auth-showcase': '1160px',
        'auth-card': '460px',
        toast: '380px',
        'chat-bubble': '92%',
        'cell-desc': '260px',
        'cell-truncate': '160px',
      },
      padding: {
        sidebar: '280px',
        'sidebar-compact': '178px',
        'push-drawer': '410px',
      },
      minHeight: {
        dvh: '100dvh',
        'nav-item': '42px',
        control: '36px',
        'control-sm': '28px',
        textarea: '88px',
      },
      maxHeight: {
        'chat-input': '132px',
        modal: '90vh',
      },
      borderWidth: {
        '2.5': '2.5px',
        '3': '3px',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1.2' }],
        xs: ['0.75rem', { lineHeight: '1.4' }],
        sm: ['0.875rem', { lineHeight: '1.5' }],
        base: ['0.9375rem', { lineHeight: '1.5' }],
        lg: ['1.125rem', { lineHeight: '1.25' }],
        xl: ['1.5rem', { lineHeight: '1.2' }],
        '2xl': ['1.875rem', { lineHeight: '1.15', letterSpacing: '-0.025em' }],
        display: ['clamp(2.25rem, 4vw, 4rem)', { lineHeight: '1', letterSpacing: '-0.06em' }],
        code: ['0.9em', { lineHeight: 'inherit' }],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      lineHeight: {
        none: '1',
        tight: '1.2',
        snug: '1.25',
        normal: '1.5',
        relaxed: '1.6',
      },
      letterSpacing: {
        tighter: '-0.06em',
        tight: '-0.025em',
        normal: '0em',
        wide: '0.05em',
        wider: '0.09em',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        full: '9999px',
      },
      boxShadow: {
        card: '0 4px 12px rgba(24, 24, 27, 0.06)',
        'card-hover': '0 14px 28px rgba(0, 0, 0, 0.16)',
        'button-hover': '0 8px 18px rgba(0, 0, 0, 0.22)',
        modal: '0 20px 48px rgba(24, 24, 27, 0.2)',
        drawer: '-4px 0 24px rgba(0, 0, 0, 0.15)',
        'push-drawer': '-12px 0 30px rgba(15, 23, 42, 0.12)',
        sidebar: '10px 0 30px rgba(15, 23, 42, 0.14)',
        toast: '0 4px 16px rgba(0, 0, 0, 0.12)',
        fab: '0 8px 22px rgba(0, 0, 0, 0.22)',
        focus: '0 0 0 3px rgba(0, 0, 0, 0.28)',
        'focus-inverse': '0 0 0 3px rgba(255, 255, 255, 0.28)',
        'focus-danger': '0 0 0 3px rgba(220, 38, 38, 0.15)',
      },
      zIndex: {
        'table-header': '1',
        sidebar: '5',
        assistant: '20',
        'mobile-assistant': '100',
        'mobile-drawer': '101',
        modal: '1000',
        backdrop: '1000',
        drawer: '1001',
        toast: '2000',
      },
      backgroundImage: {
        'page-gradient': 'linear-gradient(135deg, #ffffff 0%, #fafbfe 56%, #eef2f8 100%)',
      },
      transitionProperty: {
        'padding-right': 'padding-right',
        dimensions: 'width, height',
        input: 'border-color, box-shadow, background-color',
      },
      keyframes: {
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
        'toast-fade-in': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'stream-fade-in': {
          from: { opacity: '0.15' },
          to: { opacity: '1' },
        },
      },
      animation: {
        spin: 'spin 0.8s linear infinite',
        'toast-in': 'toast-fade-in 0.22s ease-out',
        'stream-in': 'stream-fade-in 250ms ease-out forwards',
      },
    },
  },
  plugins: [],
};

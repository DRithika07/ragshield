/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],

  theme: {
    extend: {

      // ── CYBERPUNK COLOUR PALETTE ──────────────────────────────────
      colors: {
        // Base backgrounds — deep space blacks
        bg: {
          primary:   '#020408',   // near-black base
          secondary: '#060d1a',   // dark navy panels
          tertiary:  '#0a1628',   // slightly lighter panel
          glass:     'rgba(6, 13, 26, 0.7)',
        },

        // Cyan neon — primary accent (safe, active, primary CTAs)
        cyan: {
          neon:  '#00f5ff',
          bright:'#00d4e8',
          mid:   '#0099aa',
          dark:  '#005566',
          glow:  'rgba(0, 245, 255, 0.15)',
        },

        // Purple neon — secondary accent (agents, analysis, AI)
        purple: {
          neon:  '#b347ff',
          bright:'#9333ea',
          mid:   '#6d28d9',
          dark:  '#3b1577',
          glow:  'rgba(179, 71, 255, 0.15)',
        },

        // Red alert — threat, critical, danger
        red: {
          neon:   '#ff2244',
          bright: '#ef4444',
          mid:    '#b91c1c',
          dark:   '#7f1d1d',
          glow:   'rgba(255, 34, 68, 0.20)',
        },

        // Green safe — safe prompts, success, clear
        green: {
          neon:   '#00ff88',
          bright: '#22c55e',
          mid:    '#16a34a',
          dark:   '#14532d',
          glow:   'rgba(0, 255, 136, 0.15)',
        },

        // Amber — medium threat, warning
        amber: {
          neon:   '#ffaa00',
          bright: '#f59e0b',
          mid:    '#d97706',
          dark:   '#78350f',
          glow:   'rgba(255, 170, 0, 0.15)',
        },

        // Border tones
        border: {
          subtle:  'rgba(0, 245, 255, 0.08)',
          default: 'rgba(0, 245, 255, 0.15)',
          bright:  'rgba(0, 245, 255, 0.35)',
        },
      },

      // ── TYPOGRAPHY ────────────────────────────────────────────────
      fontFamily: {
        mono:  ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        display: ['Orbitron', 'sans-serif'],  // futuristic headers
      },

      // ── GLASSMORPHISM BACKGROUNDS ─────────────────────────────────
      // Used as: bg-glass-cyan, bg-glass-purple, etc.
      backgroundImage: {
        'glass-cyan':   'linear-gradient(135deg, rgba(0,245,255,0.05) 0%, rgba(0,245,255,0.02) 100%)',
        'glass-purple': 'linear-gradient(135deg, rgba(179,71,255,0.07) 0%, rgba(179,71,255,0.02) 100%)',
        'glass-red':    'linear-gradient(135deg, rgba(255,34,68,0.08) 0%, rgba(255,34,68,0.02) 100%)',
        'glass-green':  'linear-gradient(135deg, rgba(0,255,136,0.06) 0%, rgba(0,255,136,0.02) 100%)',
        'glass-dark':   'linear-gradient(135deg, rgba(6,13,26,0.9) 0%, rgba(2,4,8,0.95) 100%)',
        'scanline':     'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,245,255,0.01) 2px, rgba(0,245,255,0.01) 4px)',
        'grid-cyber':   'linear-gradient(rgba(0,245,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,0.03) 1px, transparent 1px)',
        'threat-gradient': 'linear-gradient(135deg, #ff2244 0%, #b347ff 50%, #00f5ff 100%)',
        'safe-gradient':   'linear-gradient(135deg, #00ff88 0%, #00d4e8 100%)',
        'hero-glow':    'radial-gradient(ellipse at 50% 0%, rgba(0,245,255,0.12) 0%, transparent 70%)',
      },

      // ── NEON BOX SHADOWS ──────────────────────────────────────────
      boxShadow: {
        'neon-cyan':   '0 0 10px rgba(0,245,255,0.4), 0 0 30px rgba(0,245,255,0.15), 0 0 60px rgba(0,245,255,0.05)',
        'neon-purple': '0 0 10px rgba(179,71,255,0.4), 0 0 30px rgba(179,71,255,0.15), 0 0 60px rgba(179,71,255,0.05)',
        'neon-red':    '0 0 10px rgba(255,34,68,0.5),  0 0 30px rgba(255,34,68,0.2),  0 0 60px rgba(255,34,68,0.08)',
        'neon-green':  '0 0 10px rgba(0,255,136,0.4),  0 0 30px rgba(0,255,136,0.15), 0 0 60px rgba(0,255,136,0.05)',
        'neon-amber':  '0 0 10px rgba(255,170,0,0.4),  0 0 30px rgba(255,170,0,0.15)',
        'glass':       '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        'glass-hover': '0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        'panel':       '0 4px 24px rgba(0,0,0,0.6)',
        'inner-glow':  'inset 0 0 30px rgba(0,245,255,0.05)',
      },

      // ── BORDER RADIUS ─────────────────────────────────────────────
      borderRadius: {
        'panel': '16px',
        'card':  '12px',
        'chip':  '6px',
      },

      // ── BACKDROP BLUR ─────────────────────────────────────────────
      backdropBlur: {
        'glass': '16px',
        'heavy': '32px',
      },

      // ── KEYFRAME ANIMATIONS ───────────────────────────────────────
      keyframes: {
        // Neon pulse — used on critical indicators
        'neon-pulse': {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%':      { opacity: '0.7', filter: 'brightness(1.4)' },
        },
        // Scan line sweep — holographic effect
        'scan-sweep': {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        // Glitch flash — on threat alert
        'glitch': {
          '0%, 90%, 100%': { transform: 'translate(0)', filter: 'none' },
          '92%': { transform: 'translate(-2px, 1px)', filter: 'hue-rotate(90deg)' },
          '94%': { transform: 'translate(2px, -1px)', filter: 'hue-rotate(-90deg)' },
          '96%': { transform: 'translate(-1px, 2px)', filter: 'brightness(1.5)' },
        },
        // Floating — agent cards
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-6px)' },
        },
        // Radar sweep
        'radar': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        // Data stream — sidebar decorative
        'data-stream': {
          '0%':   { opacity: '0', transform: 'translateY(-10px)' },
          '50%':  { opacity: '1' },
          '100%': { opacity: '0', transform: 'translateY(10px)' },
        },
        // Border glow breathe
        'border-glow': {
          '0%, 100%': { borderColor: 'rgba(0,245,255,0.2)' },
          '50%':      { borderColor: 'rgba(0,245,255,0.6)' },
        },
        // Shimmer — loading skeleton
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        // Threat alert blink
        'alert-blink': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
        // Counter up
        'count-up': {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },

      // ── ANIMATION UTILITIES ───────────────────────────────────────
      animation: {
        'neon-pulse':   'neon-pulse 2s ease-in-out infinite',
        'neon-pulse-fast': 'neon-pulse 0.8s ease-in-out infinite',
        'scan-sweep':   'scan-sweep 4s linear infinite',
        'glitch':       'glitch 5s infinite',
        'float':        'float 4s ease-in-out infinite',
        'float-slow':   'float 6s ease-in-out infinite',
        'radar':        'radar 3s linear infinite',
        'data-stream':  'data-stream 2s ease-in-out infinite',
        'border-glow':  'border-glow 2s ease-in-out infinite',
        'shimmer':      'shimmer 2s linear infinite',
        'alert-blink':  'alert-blink 1s step-start infinite',
        'count-up':     'count-up 0.5s ease-out forwards',
      },

      // ── GRID BACKGROUND SIZE ──────────────────────────────────────
      backgroundSize: {
        'grid': '40px 40px',
      },

      // ── TRANSITIONS ───────────────────────────────────────────────
      transitionDuration: {
        '400': '400ms',
      },
    },
  },

  plugins: [],
}

/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

module.exports = {
    content: ['./src/renderer/**/*.{js,jsx,ts,tsx}', './index.html'],
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
                mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace'],
            },
            colors: {
                // Semantic Colors
                bg: {
                    canvas: 'hsl(var(--bg-canvas) / <alpha-value>)',
                    surface: 'hsl(var(--bg-surface) / <alpha-value>)',
                    'surface-hover': 'hsl(var(--bg-surface-hover) / <alpha-value>)',
                },
                text: {
                    primary: 'hsl(var(--text-primary) / <alpha-value>)',
                    secondary: 'hsl(var(--text-secondary) / <alpha-value>)',
                    tertiary: 'hsl(var(--text-tertiary) / <alpha-value>)',
                },
                accent: {
                    primary: 'hsl(var(--accent-primary) / <alpha-value>)',
                    foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
                    hover: 'hsl(var(--accent-hover) / <alpha-value>)',
                    subtle: 'hsl(var(--accent-subtle) / <alpha-value>)',
                },
                border: {
                    subtle: 'hsl(var(--border-subtle) / <alpha-value>)',
                    strong: 'hsl(var(--border-strong) / <alpha-value>)',
                },
                // Raw Palette
                zinc: colors.zinc,
                violet: colors.violet,
                fuchsia: colors.fuchsia,
            },
            borderRadius: {
                'squircle-sm': '8px',
                squircle: '12px',
                'squircle-lg': '16px',
                'squircle-xl': '24px',
            },
            animation: {
                'spring-in': 'spring-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                'fade-in': 'fade-in 0.2s ease-out forwards',
            },
            keyframes: {
                'spring-in': {
                    '0%': { transform: 'scale(0.9)', opacity: 0 },
                    '100%': { transform: 'scale(1)', opacity: 1 },
                },
                'fade-in': {
                    '0%': { opacity: 0 },
                    '100%': { opacity: 1 },
                },
            },
            typography: (theme) => ({
                DEFAULT: {
                    css: {
                        color: 'hsl(var(--text-primary))',
                        '--tw-prose-body': 'hsl(var(--text-primary))',
                        '--tw-prose-headings': 'hsl(var(--text-primary))',
                        '--tw-prose-links': 'hsl(var(--accent-primary))',
                        '--tw-prose-bold': 'hsl(var(--text-primary))',
                        '--tw-prose-counters': 'hsl(var(--text-secondary))',
                        '--tw-prose-bullets': 'hsl(var(--text-secondary))',
                        '--tw-prose-hr': 'hsl(var(--border-subtle))',
                        '--tw-prose-quotes': 'hsl(var(--text-primary))',
                        '--tw-prose-quote-borders': 'hsl(var(--accent-primary))',
                        '--tw-prose-captions': 'hsl(var(--text-tertiary))',
                        '--tw-prose-code': 'hsl(var(--accent-primary))',
                        '--tw-prose-pre-code': 'hsl(var(--text-primary))',
                        '--tw-prose-pre-bg': 'hsl(var(--bg-canvas))',
                        '--tw-prose-th-borders': 'hsl(var(--border-strong))',
                        '--tw-prose-td-borders': 'hsl(var(--border-subtle))',
                        th: {
                            color: 'hsl(var(--text-primary))',
                        },
                    },
                },
                invert: {
                    css: {
                        color: 'hsl(var(--accent-foreground))',
                        '--tw-prose-body': 'hsl(var(--accent-foreground))',
                        '--tw-prose-headings': 'hsl(var(--accent-foreground))',
                        '--tw-prose-links': 'hsl(var(--accent-foreground))',
                        '--tw-prose-bold': 'hsl(var(--accent-foreground))',
                        '--tw-prose-counters': 'hsl(var(--accent-foreground))',
                        '--tw-prose-bullets': 'hsl(var(--accent-foreground))',
                        '--tw-prose-hr': 'hsl(var(--accent-foreground) / 0.2)',
                        '--tw-prose-quotes': 'hsl(var(--accent-foreground))',
                        '--tw-prose-quote-borders': 'hsl(var(--accent-foreground))',
                        '--tw-prose-captions': 'hsl(var(--accent-foreground) / 0.7)',
                        '--tw-prose-code': 'hsl(var(--accent-foreground))',
                        '--tw-prose-pre-code': 'hsl(var(--accent-foreground))',
                        '--tw-prose-pre-bg': 'hsl(var(--bg-canvas) / 0.2)',
                        '--tw-prose-th-borders': 'hsl(var(--accent-foreground) / 0.3)',
                        '--tw-prose-td-borders': 'hsl(var(--accent-foreground) / 0.1)',
                        th: {
                            color: 'hsl(var(--accent-foreground))',
                        },
                    },
                },
            }),
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/typography'),
    ],
};

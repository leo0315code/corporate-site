/** @type {import('tailwindcss').Config} */
// 设计 token 固化：全站只用语义化类名（bg-primary / text-text-secondary 等），
// 组件内禁止写十六进制色值。换品牌色只需改此处 + site.config.ts。
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '1.5rem', // 24px 左右留白
      },
      screens: {
        '2xl': '1200px',
      },
    },
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E4FD8', // 品牌蓝
          dark: '#173DA8', // hover / 深色态
          light: '#EEF3FF', // 浅底（区块背景）
        },
        secondary: '#0F1B33', // 深蓝近黑（标题、页脚背景）
        accent: '#00B4A6', // 点缀色（数据、标签）
        text: {
          DEFAULT: '#1A1A1A', // 正文主色
          secondary: '#5A6472', // 次要文字
          muted: '#8C97A6', // 辅助/占位文字
        },
        border: '#E5E8EE', // 边框、分割线
        'bg-soft': '#F7F8FA', // 交替区块背景
        success: '#12B76A',
        error: '#F04438',
      },
      fontFamily: {
        sans: [
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      fontSize: {
        // 标题与正文字号体系（PRD 8.2）
        h1: ['2.5rem', { lineHeight: '1.3', fontWeight: '700' }], // 40px
        h2: ['2rem', { lineHeight: '1.3', fontWeight: '700' }], // 32px
        h3: ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }], // 24px
        base: ['1rem', { lineHeight: '1.7' }], // 16px
        sm: ['0.875rem', { lineHeight: '1.6' }], // 14px
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '20px',
        btn: '8px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(16, 24, 40, 0.06)',
        md: '0 8px 24px rgba(16, 24, 40, 0.08)',
        lg: '0 16px 40px rgba(16, 24, 40, 0.12)',
      },
      spacing: {
        // 区块上下留白：PC 96px / 移动 56px
        section: '6rem', // 96px
        'section-mobile': '3.5rem', // 56px
      },
      maxWidth: {
        container: '1200px',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.6s ease-out both',
        'fade-in': 'fade-in 0.4s ease-out both',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

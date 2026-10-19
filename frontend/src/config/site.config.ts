import type { SiteConfig } from '@/types';

/* ============================================================
   站点级配置（换企业核心文件之一）
   ------------------------------------------------------------
   修改本文件 + tailwind.config.js 的 colors 即可替换：
   - 公司名 / Logo / 标语 / 简介
   - 导航菜单
   - 联系方式（电话/邮箱/地址/工作时间/地图）
   - 页脚（版权/备案/社交）
   - 主题色（配合 tailwind.config.js）
   - SEO（标题/描述/关键词）
   ============================================================ */

export const siteConfig: SiteConfig = {
  companyName: '示例科技',
  logo: '/logo.svg',
  slogan: '专业的企业数字化解决方案',
  description:
    '示例科技是一家专注企业数字化解决方案的服务商，提供咨询、产品与实施一体化服务，帮助企业降本增效、加速转型。',

  nav: [
    { label: '首页', path: '/' },
    { label: '关于我们', path: '/about' },
    { label: '产品服务', path: '/products' },
    { label: '新闻中心', path: '/news' },
    { label: '联系我们', path: '/contact' },
  ],

  contact: {
    phone: '400-000-0000',
    email: 'contact@example.com',
    address: '北京市朝阳区示例大厦 A 座 18 层',
    workTime: '周一至周五 9:00 - 18:00',
    mapImage: '/map-placeholder.svg',
  },

  footer: {
    copyright: '© 2024 示例科技 保留所有权利',
    icp: '京ICP备00000000号',
    quickLinks: [
      { label: '关于我们', path: '/about' },
      { label: '产品服务', path: '/products' },
      { label: '新闻中心', path: '/news' },
      { label: '联系我们', path: '/contact' },
    ],
    socials: [
      { label: '微信公众号', url: '#', icon: 'wechat' },
      { label: '企业微博', url: '#', icon: 'weibo' },
      { label: '领英', url: '#', icon: 'linkedin' },
    ],
  },

  theme: {
    primary: '#1E4FD8',
    secondary: '#0F1B33',
    accent: '#00B4A6',
  },

  seo: {
    title: '示例科技 | 专业的企业数字化解决方案',
    description:
      '示例科技为企业提供数字化咨询、产品研发与实施服务，助力企业降本增效、加速数字化转型升级。',
    keywords: '企业官网,数字化解决方案,企业服务,产品服务,新闻中心',
  },
};

export default siteConfig;

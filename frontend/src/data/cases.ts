import type { CaseItem } from '@/types';

/* ============================================================
   首页「客户案例 / 合作伙伴」
   部署方按实际合作客户替换 name / logo / desc 即可
   ============================================================ */

export const cases: CaseItem[] = [
  {
    id: 'case-1',
    name: '某制造集团',
    logo: '/case-logo-1.svg',
    desc: '智能工厂数字化改造，提升产线透明度与设备综合效率。',
  },
  {
    id: 'case-2',
    name: '某连锁零售',
    logo: '/case-logo-2.svg',
    desc: '搭建数据智能分析平台，实现门店经营决策数据化。',
  },
  {
    id: 'case-3',
    name: '某全国性银行',
    logo: '/case-logo-3.svg',
    desc: '信创环境下的数据分析平台建设，满足合规与自主可控。',
  },
  {
    id: 'case-4',
    name: '某能源企业',
    logo: '/case-logo-4.svg',
    desc: '云原生架构升级，支撑业务弹性伸缩与快速上线。',
  },
  {
    id: 'case-5',
    name: '某互联网平台',
    logo: '/case-logo-5.svg',
    desc: 'AI 智能客服落地，显著降低人工客服成本。',
  },
  {
    id: 'case-6',
    name: '某物流企业',
    logo: '/case-logo-6.svg',
    desc: '定制开发调度管理系统，提升运力调度效率。',
  },
];

export default cases;

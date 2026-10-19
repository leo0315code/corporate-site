import type { Advantage } from '@/types';

/* ============================================================
   首页「数据与优势」区块
   value 用于突出展示的关键数字，label 为说明，desc 为补充描述
   ============================================================ */

export const advantages: Advantage[] = [
  {
    value: '300+',
    label: '服务企业客户',
    desc: '覆盖制造、零售、金融、能源等多个行业',
  },
  {
    value: '8+',
    label: '行业深耕年限',
    desc: '自 2016 年以来持续专注企业数字化领域',
  },
  {
    value: '99.9%',
    label: '系统可用性',
    desc: '以稳定的架构与运维保障业务连续运行',
  },
  {
    value: '7×24',
    label: '运维响应',
    desc: '全天候监控告警与应急响应服务',
  },
];

export default advantages;

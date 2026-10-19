import { useCallback, useEffect, useRef, useState } from 'react';
import { CMS_PAGE_SIZES } from '@/constants';
import { listContent } from '@/services/cms';
import type { ContentType } from '@/services/cms';
import type { PagedData } from '@/types';

/* ============================================================
   内容列表通用状态 Hook（产品 / 新闻等后台列表页复用）
   - 管理分页 / 搜索 / 刷新 / 加载态 / 删除后页码回退
   - 用递增 reqId 丢弃过期响应，避免快速切换时的竞态覆盖
   ============================================================ */

export interface UseContentListResult<T> {
  /** 当前页数据行 */
  rows: T[];
  /** 总条数 */
  total: number;
  /** 当前页（从 1 开始） */
  page: number;
  /** 每页条数 */
  size: number;
  /** 是否加载中 */
  loading: boolean;
  /** 加载错误文案（空串表示无错误） */
  error: string;
  /** 搜索框输入值（未提交） */
  keywordInput: string;
  /** 更新搜索框输入值 */
  setKeywordInput: (value: string) => void;
  /** 分类筛选当前选中值（未提交） */
  selectedCategory: string;
  /** 更新分类筛选选中值 */
  setSelectedCategory: (value: string) => void;
  /** 应用搜索（重置到第 1 页） */
  applySearch: () => void;
  /** 清空搜索条件（重置到第 1 页） */
  resetSearch: () => void;
  /** 切换分页 / 每页条数 */
  changePage: (page: number, size: number) => void;
  /** 重新加载当前页 */
  refresh: () => Promise<void>;
  /** 删除后处理：本页仅剩一条且非首页 → 回退一页；否则刷新 */
  afterDelete: (remainingOnPage: number) => void;
}

/**
 * 内容列表状态 Hook
 *
 * @param type 内容类型（product / news / case / advantage）
 * @param initialCategory 初始分类筛选值
 * @returns 列表状态与操作回调
 */
export function useContentList<T>(
  type: ContentType,
  initialCategory = '',
): UseContentListResult<T> {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(CMS_PAGE_SIZES[0]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [category, setCategory] = useState(initialCategory);
  const [data, setData] = useState<PagedData<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /** 请求序号：仅最后一次请求的结果被采纳 */
  const reqIdRef = useRef(0);

  /** 加载当前查询条件下的列表 */
  const load = useCallback(async (): Promise<void> => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');

    try {
      const res = await listContent<T>(type, {
        page,
        size,
        keyword: keyword || undefined,
        category: category || undefined,
      });
      if (reqId !== reqIdRef.current) {
        return;
      }
      setData(res);
    } catch (err) {
      if (reqId !== reqIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : '列表加载失败');
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [type, page, size, keyword, category]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 应用搜索：把输入值提交为查询条件并回到第 1 页 */
  const applySearch = useCallback((): void => {
    setKeyword(keywordInput.trim());
    setCategory(selectedCategory.trim());
    setPage(1);
  }, [keywordInput, selectedCategory]);

  /** 清空搜索条件 */
  const resetSearch = useCallback((): void => {
    setKeywordInput('');
    setSelectedCategory(initialCategory);
    setKeyword('');
    setCategory(initialCategory);
    setPage(1);
  }, [initialCategory]);

  /** 分页变更 */
  const changePage = useCallback((nextPage: number, nextSize: number): void => {
    setSize(nextSize);
    setPage(nextPage);
  }, []);

  /** 手动刷新当前页 */
  const refresh = useCallback(async (): Promise<void> => {
    await load();
  }, [load]);

  /** 删除后处理：本页删空且非首页时回退一页，否则刷新当前页 */
  const afterDelete = useCallback(
    (remainingOnPage: number): void => {
      if (remainingOnPage <= 0 && page > 1) {
        setPage(page - 1);
      } else {
        void load();
      }
    },
    [page, load],
  );

  return {
    rows: data?.items ?? [],
    total: data?.total ?? 0,
    page,
    size,
    loading,
    error,
    keywordInput,
    setKeywordInput,
    selectedCategory,
    setSelectedCategory,
    applySearch,
    resetSearch,
    changePage,
    refresh,
    afterDelete,
  };
}

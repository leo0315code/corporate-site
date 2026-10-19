import { useCallback, useEffect, useRef, useState } from 'react';
import { clearContentCache } from '@/services/api';

/**
 * 内容读取 Hook：统一 loading / error / 降级 / 重试。
 *
 * 行为：
 * - 首次进入 `loading=true`；命中内存缓存（TTL 60s）则立即返回缓存并结束 loading；
 * - 成功后写入内存缓存；
 * - 失败**降级**：若提供 `fallback`（如 `src/data/*.ts`），用它兜底，同时 `error` 仍暴露；
 * - `retry()` 清除该 key 缓存（及底层内容缓存）后重新拉取；
 * - 组件卸载后不再 setState（`cancelled` 标志），避免 React 警告。
 *
 * 说明：底层 `services/api.ts` 的内容 GET 亦有 60s 缓存；本 Hook 缓存用于跨组件复用。
 * `retry()` 同时清两层缓存以保证「刷新即生效」。
 */

/** Hook 级缓存项 */
interface HookCacheEntry {
  data: unknown;
  expireAt: number;
}

/** Hook 级缓存（模块级，跨组件复用） */
const hookCache = new Map<string, HookCacheEntry>();

/** Hook 缓存 TTL（毫秒），与后端 Cache-Control 对齐 */
const HOOK_CACHE_TTL = 60_000;

/** useContent 返回值 */
export interface UseContentResult<T> {
  /** 数据（未加载完成且无 fallback 时为 null） */
  data: T | null;
  /** 是否加载中 */
  loading: boolean;
  /** 错误对象（失败时非空；降级场景下与 data 同时存在） */
  error: unknown;
  /** 手动重试（清缓存后重新拉取） */
  retry: () => void;
}

/**
 * 读取并缓存异步内容
 *
 * @param key 缓存键（不同区块/参数应使用不同 key）
 * @param fetcher 数据加载函数（如 `fetchHomeSummary`）
 * @param fallback 失败降级数据（如 `src/data/*.ts` 导出值）
 * @returns 状态对象
 */
export function useContent<T>(
  key: string,
  fetcher: () => Promise<T>,
  fallback?: T,
): UseContentResult<T> {
  // 用 ref 持有最新 fetcher / fallback，避免其身份变化触发重复请求
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fallbackRef = useRef<T | undefined>(fallback);
  fallbackRef.current = fallback;

  const [data, setData] = useState<T | null>(() => {
    const cached = hookCache.get(key);
    if (cached && Date.now() < cached.expireAt) {
      return cached.data as T;
    }
    return fallback ?? null;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    const cached = hookCache.get(key);
    return !(cached && Date.now() < cached.expireAt);
  });

  const [error, setError] = useState<unknown>(null);

  /** 卸载/切换 key 标志 */
  const cancelledRef = useRef(false);

  /**
   * 执行加载
   * @param force true=强制忽略 Hook 缓存重新拉取（retry 用）
   */
  const load = useCallback(
    async (force: boolean): Promise<void> => {
      if (!force) {
        const cached = hookCache.get(key);
        if (cached && Date.now() < cached.expireAt) {
          setData(cached.data as T);
          setError(null);
          setLoading(false);
          return;
        }
      }

      setLoading(true);
      try {
        const result = await fetcherRef.current();
        if (cancelledRef.current) {
          return;
        }
        hookCache.set(key, { data: result, expireAt: Date.now() + HOOK_CACHE_TTL });
        setData(result);
        setError(null);
      } catch (err) {
        if (cancelledRef.current) {
          return;
        }
        setError(err);
        // 降级：有 fallback 则用它兜底（error 仍暴露）
        if (fallbackRef.current !== undefined) {
          setData(fallbackRef.current);
        }
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
        }
      }
    },
    [key],
  );

  useEffect(() => {
    cancelledRef.current = false;
    void load(false);
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const retry = useCallback((): void => {
    // 清除本 key 的 Hook 缓存 + 底层内容缓存，确保拿到最新数据
    hookCache.delete(key);
    clearContentCache();
    void load(true);
  }, [key, load]);

  return { data, loading, error, retry };
}

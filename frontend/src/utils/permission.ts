import type { CmsModule } from '@/constants';

/**
 * 前端权限判定（**仅用于隐藏入口，不是安全边界**）
 *
 * 真正的权限裁决在服务端 `AdminAuth` + `Rbac`：即使前端被绕过，
 * 越权写操作仍会返回 `1009 / HTTP 403`。此处只负责「别让用户点了才发现没权限」。
 *
 * 权限点格式：`{module}.read` / `{module}.write`，由后端 `toProfile()` 直接下发，
 * 前端**不自行推导**角色→权限的映射，避免前后端规则漂移。
 */

/** 动作类型 */
export type PermissionAction = 'read' | 'write';

/**
 * 判断是否具备某模块的某动作权限
 *
 * @param permissions 后端下发的权限点列表（未加载时传空数组）
 * @param module      模块名
 * @param action      read（默认）或 write
 * @returns 是否具备
 */
export function hasPermission(
  permissions: string[] | undefined,
  module: CmsModule,
  action: PermissionAction = 'read',
): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }

  return permissions.includes(`${module}.${action}`);
}

/**
 * 判断是否可进入某模块（读权限）
 *
 * @param permissions 权限点列表
 * @param module      模块名
 */
export function canRead(permissions: string[] | undefined, module: CmsModule): boolean {
  return hasPermission(permissions, module, 'read');
}

/**
 * 判断是否可写某模块
 *
 * @param permissions 权限点列表
 * @param module      模块名
 */
export function canWrite(permissions: string[] | undefined, module: CmsModule): boolean {
  return hasPermission(permissions, module, 'write');
}

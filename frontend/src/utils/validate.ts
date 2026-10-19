import { MESSAGES, VALIDATION } from '@/constants';
import type { MessagePayload } from '@/types';

/**
 * 留言表单校验错误结构：字段名 -> 错误提示
 * 未通过校验的字段才会出现在该对象中
 */
export type MessageFormErrors = Partial<Record<keyof MessagePayload, string>>;

/**
 * 校验单字段：姓名（必填，2~30 字符）
 * @param name 姓名
 * @returns 错误提示，通过时返回 undefined
 */
export function validateName(name: string): string | undefined {
  const value = (name ?? '').trim();
  if (!value) {
    return MESSAGES.REQUIRED;
  }
  if (value.length < VALIDATION.NAME_MIN || value.length > VALIDATION.NAME_MAX) {
    return `姓名需为 ${VALIDATION.NAME_MIN}~${VALIDATION.NAME_MAX} 个字符`;
  }
  return undefined;
}

/**
 * 校验单字段：公司名称（选填，≤50 字符）
 * @param company 公司名称（可为空）
 * @returns 错误提示，通过时返回 undefined
 */
export function validateCompany(company?: string): string | undefined {
  const value = (company ?? '').trim();
  if (!value) {
    return undefined; // 选填，允许为空
  }
  if (value.length > VALIDATION.COMPANY_MAX) {
    return `公司名称不得超过 ${VALIDATION.COMPANY_MAX} 个字符`;
  }
  return undefined;
}

/**
 * 校验单字段：电话（选填但需格式正确；与邮箱至少填一项，由 validateMessage 统一校验）
 * @param phone 电话
 * @param required 是否必填（当邮箱为空时电话为必填）
 * @returns 错误提示，通过时返回 undefined
 */
export function validatePhone(phone: string, required = false): string | undefined {
  const value = (phone ?? '').trim();
  if (!value) {
    return required ? '请填写电话或邮箱' : undefined;
  }
  if (
    !VALIDATION.PHONE_MOBILE_REGEX.test(value) &&
    !VALIDATION.PHONE_TEL_REGEX.test(value)
  ) {
    return '请填写正确的电话号码';
  }
  return undefined;
}

/**
 * 校验单字段：邮箱（选填但需格式正确）
 * @param email 邮箱
 * @param required 是否必填（当电话为空时邮箱为必填）
 * @returns 错误提示，通过时返回 undefined
 */
export function validateEmail(email: string, required = false): string | undefined {
  const value = (email ?? '').trim();
  if (!value) {
    return required ? '请填写电话或邮箱' : undefined;
  }
  if (!VALIDATION.EMAIL_REGEX.test(value)) {
    return '请填写正确的邮箱';
  }
  return undefined;
}

/**
 * 校验单字段：留言内容（必填，5~500 字符）
 * @param content 留言内容
 * @returns 错误提示，通过时返回 undefined
 */
export function validateContent(content: string): string | undefined {
  const value = (content ?? '').trim();
  if (!value) {
    return MESSAGES.REQUIRED;
  }
  if (value.length < VALIDATION.CONTENT_MIN || value.length > VALIDATION.CONTENT_MAX) {
    return `留言内容需为 ${VALIDATION.CONTENT_MIN}~${VALIDATION.CONTENT_MAX} 个字符`;
  }
  return undefined;
}

/**
 * 整体校验留言表单（规则与后端 MessageValidate 完全一致）：
 * - name：必填，2~30
 * - company：选填，≤50
 * - phone / email：至少填一项，且填写时格式需正确
 * - content：必填，5~500
 * @param payload 表单数据
 * @returns 字段错误集合；为空对象表示校验通过
 */
export function validateMessage(payload: MessagePayload): MessageFormErrors {
  const errors: MessageFormErrors = {};

  const nameError = validateName(payload.name);
  if (nameError) {
    errors.name = nameError;
  }

  const companyError = validateCompany(payload.company);
  if (companyError) {
    errors.company = companyError;
  }

  const phone = (payload.phone ?? '').trim();
  const email = (payload.email ?? '').trim();

  // 电话 / 邮箱至少填一项
  if (!phone && !email) {
    errors.phone = '请填写电话或邮箱';
    errors.email = '请填写电话或邮箱';
  } else {
    const phoneError = validatePhone(phone, false);
    if (phoneError) {
      errors.phone = phoneError;
    }
    const emailError = validateEmail(email, false);
    if (emailError) {
      errors.email = emailError;
    }
  }

  const contentError = validateContent(payload.content);
  if (contentError) {
    errors.content = contentError;
  }

  return errors;
}

/**
 * 判断整体校验是否通过
 * @param errors validateMessage 返回的错误集合
 */
export function isMessageValid(errors: MessageFormErrors): boolean {
  return Object.keys(errors).length === 0;
}

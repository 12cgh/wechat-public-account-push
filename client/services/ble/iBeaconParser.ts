/**
 * iBeacon 广播数据解析（纯 TypeScript，可单元测试）
 *
 * Apple iBeacon 的 Manufacturer Data 结构（共 25 字节）：
 *   offset 0-1 : 公司 ID（Apple = 0x004C，小端 => 0x4C 0x00）
 *   offset 2   : 类型（0x02）
 *   offset 3   : 长度（0x15 = 21）
 *   offset 4-19: UUID（16 字节，大端）
 *   offset 20-21: Major（大端）
 *   offset 22-23: Minor（大端）
 *   offset 24  : 发射功率 Tx Power（有符号 int8，如 -59）
 */

import { Base64 } from 'js-base64';

export interface IBeaconAdvertisement {
  uuid: string;
  major: number;
  minor: number;
  /** 1 米处参考发射功率（dBm） */
  txPower: number;
}

const APPLE_COMPANY_ID_LOW = 0x4c;
const APPLE_COMPANY_ID_HIGH = 0x00;
const IBEACON_TYPE = 0x02;
const IBEACON_LENGTH = 0x15;

/** 解析 BLE 广播中的 manufacturerData（Base64 字符串） */
export function parseIBeaconManufacturerData(base64Data: string | null | undefined): IBeaconAdvertisement | null {
  if (!base64Data) return null;
  let bytes: Uint8Array;
  try {
    bytes = Base64.toUint8Array(base64Data);
  } catch {
    return null;
  }
  if (bytes.length < 25) return null;
  if (bytes[0] !== APPLE_COMPANY_ID_LOW || bytes[1] !== APPLE_COMPANY_ID_HIGH) return null;
  if (bytes[2] !== IBEACON_TYPE || bytes[3] !== IBEACON_LENGTH) return null;

  const uuid = formatUuid(Array.from(bytes.slice(4, 20)));
  const major = (bytes[20] << 8) | bytes[21];
  const minor = (bytes[22] << 8) | bytes[23];
  // 有符号 int8
  const txPower = bytes[24] << 24 >> 24;

  return { uuid, major, minor, txPower };
}

/** 16 字节 → 标准 UUID 字符串 */
export function formatUuid(bytes: number[]): string {
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** 标准 UUID 字符串 → 小写紧凑形式（去掉横线），便于比较 */
export function normalizeUuid(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase();
}

/** 判断 UUID 是否匹配 */
export function uuidMatches(expected: string | undefined | null, actual: string | undefined | null): boolean {
  if (!expected) return true;
  if (!actual) return false;
  return normalizeUuid(expected) === normalizeUuid(actual);
}
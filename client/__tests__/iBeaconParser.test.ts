/**
 * iBeacon 广播解析单元测试
 */
import { parseIBeaconManufacturerData, formatUuid, normalizeUuid, uuidMatches } from '../services/ble/iBeaconParser';
import { Base64 } from 'js-base64';

/** 构造一个合法的 iBeacon Manufacturer Data（Base64） */
function buildIBeaconMdata(uuidHex: string, major: number, minor: number, txPower: number): string {
  // 25 字节
  const bytes = new Uint8Array(25);
  bytes[0] = 0x4c; // Apple company id low
  bytes[1] = 0x00; // company id high
  bytes[2] = 0x02; // type
  bytes[3] = 0x15; // length
  for (let i = 0; i < 16; i++) {
    bytes[4 + i] = parseInt(uuidHex.slice(i * 2, i * 2 + 2), 16);
  }
  bytes[20] = (major >> 8) & 0xff;
  bytes[21] = major & 0xff;
  bytes[22] = (minor >> 8) & 0xff;
  bytes[23] = minor & 0xff;
  bytes[24] = txPower & 0xff;
  return Base64.fromUint8Array(bytes);
}

describe('iBeaconParser', () => {
  const UUID = 'e2c56db5dffb48d2b060d0f5a71096e0';

  it('解析合法 iBeacon 广播', () => {
    const b64 = buildIBeaconMdata(UUID, 100, 200, -59);
    const parsed = parseIBeaconManufacturerData(b64);
    expect(parsed).not.toBeNull();
    expect(parsed!.uuid).toBe('e2c56db5-dffb-48d2-b060-d0f5a71096e0');
    expect(parsed!.major).toBe(100);
    expect(parsed!.minor).toBe(200);
    expect(parsed!.txPower).toBe(-59);
  });

  it('解析负 txPower（0x85 = -123）', () => {
    const b64 = buildIBeaconMdata(UUID, 1, 1, -123);
    const parsed = parseIBeaconManufacturerData(b64);
    expect(parsed!.txPower).toBe(-123);
  });

  it('非 Apple 厂商数据返回 null', () => {
    const b64 = buildIBeaconMdata(UUID, 1, 1, -59);
    const bytes = Base64.toUint8Array(b64);
    bytes[0] = 0x9a; // 改成非 Apple
    const parsed = parseIBeaconManufacturerData(Base64.fromUint8Array(bytes));
    expect(parsed).toBeNull();
  });

  it('空/null 输入返回 null', () => {
    expect(parseIBeaconManufacturerData(null)).toBeNull();
    expect(parseIBeaconManufacturerData('')).toBeNull();
    expect(parseIBeaconManufacturerData('!!!invalid base64!!!')).toBeNull();
  });

  it('UUID 匹配忽略大小写与横线', () => {
    expect(
      uuidMatches('E2C56DB5-DFFB-48D2-B060-D0F5A71096E0', 'e2c56db5-dffb-48d2-b060-d0f5a71096e0')
    ).toBe(true);
    expect(uuidMatches('abc', 'def')).toBe(false);
    expect(uuidMatches('', 'anything')).toBe(true);
    expect(uuidMatches(undefined, 'x')).toBe(true);
  });

  it('formatUuid / normalizeUuid 正确', () => {
    const bytes = Array.from({ length: 16 }, (_, i) => i);
    expect(formatUuid(bytes)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(normalizeUuid('E2C5-6DB5')).toBe('e2c56db5');
  });
});
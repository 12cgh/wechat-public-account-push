/**
 * RSSI 滤波单元测试
 */
import { RssiFilter, medianOf } from '../services/ble/rssiFilter';

describe('rssiFilter - medianOf', () => {
  it('奇数窗口取中位数', () => {
    expect(medianOf([1, 3, 2, 8, 5])).toBe(3);
  });

  it('偶数窗口取两中位平均', () => {
    expect(medianOf([1, 4, 2, 3])).toBe(2.5);
  });

  it('空数组返回 0', () => {
    expect(medianOf([])).toBe(0);
  });
});

describe('rssiFilter - RssiFilter', () => {
  it('连续同值输入收敛到该值附近', () => {
    const f = new RssiFilter();
    let last = -60;
    for (let i = 0; i < 30; i++) {
      last = f.push(-60);
    }
    expect(Math.abs(last - -60)).toBeLessThan(1);
  });

  it('结果介于原始输入波动范围内', () => {
    const f = new RssiFilter();
    let last = -60;
    for (let i = 0; i < 20; i++) {
      last = f.push(-60 + (i % 7) * 2 - 6); // -66 ~ -60 波动
    }
    expect(last).toBeGreaterThanOrEqual(-66);
    expect(last).toBeLessThanOrEqual(-59);
  });

  it('离群值不会过度拉偏滤波结果', () => {
    const f = new RssiFilter();
    for (let i = 0; i < 10; i++) f.push(-60);
    const before = f.value!;
    // 单次穿入 -90 的离群样本
    const afterSingle = f.push(-90);
    // 不会从 -60 跳到 -90
    expect(Math.abs(afterSingle - before)).toBeLessThan(10);
  });

  it('非法输入被忽略并返回上一次滤波值', () => {
    const f = new RssiFilter();
    const v = f.push(-60);
    expect(f.push(NaN)).toBe(v);
    expect(f.push(999)).toBe(v);
    expect(f.push(-999)).toBe(v);
  });

  it('reset 后 count 归零', () => {
    const f = new RssiFilter();
    f.push(-60);
    f.reset();
    expect(f.count).toBe(0);
    expect(f.value).toBeNull();
  });
});
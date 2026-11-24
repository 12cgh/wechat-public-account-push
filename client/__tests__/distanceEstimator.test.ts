/**
 * 距离估算单元测试
 */
import { DistanceEstimator, DEFAULT_CALIBRATION, clampDistance } from '../services/ble/distanceEstimator';

describe('distanceEstimator - 路径损耗模型', () => {
  const est = new DistanceEstimator();

  it('RSSI 等于 txPower 时距离约为 1 米', () => {
    const d = est.estimate(-59);
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.1);
  });

  it('信号越弱距离越远（单调性）', () => {
    const d1 = est.estimate(-50);
    const d2 = est.estimate(-70);
    const d3 = est.estimate(-90);
    expect(d1).toBeLessThan(d2);
    expect(d2).toBeLessThan(d3);
  });

  it('10dB 衰减约等于距离翻倍（开阔空间 n=2）', () => {
    const d = est.estimate(-79); // -59 - 20 => 10^(20/20) = 10 倍, 即 10m
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(11);
  });

  it('补偿 offset 修正手机射频差异', () => {
    // 同一手机实测 1m 处为 -63，说明灵敏度低 4dB，offset=+4
    const estCompensated = new DistanceEstimator({ ...DEFAULT_CALIBRATION, calibratedOffset: 4 });
    const d = estCompensated.estimate(-63); // corrected = -59 => 1m
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.1);
  });

  it('环境因子 n 越大衰减越快（同 RSSI 距离更短）', () => {
    const indoor = new DistanceEstimator({ ...DEFAULT_CALIBRATION, environmentFactor: 3 });
    const outdoor = new DistanceEstimator({ ...DEFAULT_CALIBRATION, environmentFactor: 2 });
    expect(indoor.estimate(-70)).toBeLessThan(outdoor.estimate(-70));
  });

  it('距离被限制在合理区间', () => {
    expect(clampDistance(-5)).toBe(0.1);
    expect(est.estimate(-127)).toBeLessThanOrEqual(50);
    expect(est.estimate(-30)).toBeGreaterThan(0.1);
  });
});
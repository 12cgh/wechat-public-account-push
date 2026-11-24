/**
 * 距离校准单元测试
 */
import {
  calibrateFromSamples,
  calibratePhoneOffset,
  buildCalibration,
  generateDemoSamples,
} from '../services/ble/distanceCalibrator';
import { DistanceEstimator, DEFAULT_CALIBRATION } from '../services/ble/distanceEstimator';

describe('distanceCalibrator - 多点标定', () => {
  it('少于 2 组样本返回失败', () => {
    const r = calibrateFromSamples([{ distanceMeters: 1, rssi: -59 }]);
    expect(r.ok).toBe(false);
  });

  it('样本距离无区分度返回失败', () => {
    const r = calibrateFromSamples([
      { distanceMeters: 1, rssi: -59 },
      { distanceMeters: 1.1, rssi: -60 },
    ]);
    expect(r.ok).toBe(false);
  });

  it('理想样本可还原 txPower 与 n', () => {
    // 构造理想数据：txPower=-58, n=2.2
    const profile = { txPower: -58, environmentFactor: 2.2, calibratedOffset: 0 };
    const samples = [
      { distanceMeters: 1, rssi: -58 },
      { distanceMeters: 3, rssi: -58 - 10 * 2.2 * Math.log10(3) },
      { distanceMeters: 8, rssi: -58 - 10 * 2.2 * Math.log10(8) },
      { distanceMeters: 15, rssi: -58 - 10 * 2.2 * Math.log10(15) },
    ];
    const r = calibrateFromSamples(samples);
    expect(r.ok).toBe(true);
    expect(Math.abs(r.profile!.txPower - -58)).toBeLessThan(1.5);
    expect(Math.abs(r.profile!.environmentFactor - 2.2)).toBeLessThan(0.3);
  });

  it('带噪声样本也能收敛到大致正确的模型', () => {
    const profile = { txPower: -59, environmentFactor: 2.0, calibratedOffset: 1.5 };
    const samples = generateDemoSamples(profile, [1, 2, 4, 8, 15], 1.5);
    const r = calibrateFromSamples(samples);
    expect(r.ok).toBe(true);
    expect(Math.abs(r.profile!.txPower - -59)).toBeLessThan(4);
    expect(Math.abs(r.profile!.environmentFactor - 2.0)).toBeLessThan(1);
    // 使用标定结果估算原始样本距离，误差应可控
    const est = new DistanceEstimator(r.profile!);
    for (const s of samples) {
      const d = est.estimate(s.rssi);
      expect(Math.abs(d - s.distanceMeters)).toBeLessThan(s.distanceMeters * 0.6 + 1);
    }
  });
});

describe('distanceCalibrator - 手机灵敏度补偿', () => {
  it('实测 1 米处弱 4dB => offset=+4', () => {
    const r = calibratePhoneOffset([-63, -62, -64], -59);
    expect(r.ok).toBe(true);
    expect(Math.abs(r.offset - 4)).toBeLessThan(1.5);
  });

  it('样本不足返回失败', () => {
    const r = calibratePhoneOffset([-62], -59);
    expect(r.ok).toBe(false);
  });
});

describe('distanceCalibrator - buildCalibration 端到端', () => {
  it('从样本生成可用档案并修正距离', () => {
    const profile = { txPower: -56, environmentFactor: 2.4, calibratedOffset: 2 };
    const rangeSamples = generateDemoSamples(profile, [1, 2, 5, 10], 1);
    // 1 米样本：rssi ≈ -56 - 0 + offset 概念，实测约 -54（模拟时不含 offset） => 用生成器数值
    const at1m = generateDemoSamples(profile, [1], 0.5).map((s) => s.rssi);
    const r = buildCalibration(rangeSamples, at1m);
    expect(r.ok).toBe(true);
    const est = new DistanceEstimator(r.profile!);
    // 用校准后的模型估算 5m 样本，误差应较小
    const sample5m = generateDemoSamples(profile, [5], 0.5)[0];
    const d = est.estimate(sample5m.rssi);
    expect(Math.abs(d - 5)).toBeLessThan(2.5);
  });
});

describe('distanceCalibrator - DEFAULT 基线', () => {
  it('默认档案可直接估算 1m', () => {
    const est = new DistanceEstimator(DEFAULT_CALIBRATION);
    expect(est.estimate(-59)).toBeGreaterThan(0.9);
    expect(est.estimate(-59)).toBeLessThan(1.1);
  });
});
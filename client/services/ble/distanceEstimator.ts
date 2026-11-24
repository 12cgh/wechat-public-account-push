/**
 * RSSI → 距离估算模块（纯 TypeScript，可单元测试）
 *
 * 使用无线传播路径损耗模型（Log-Distance Path Loss Model）：
 *
 *   RSSI = txPower - 10 * n * log10(d)
 *   =>  d = 10 ^ ((txPower - RSSI) / (10 * n))
 *
 * 其中：
 *   - txPower：1 米处参考 RSSI（dBm），iBeacon 标准约 -59
 *   - n：路径损耗指数（2.0 开阔空间 ~ 2.5~3.0 室内环境）
 *   - calibratedOffset：手机射频差异补偿，estimate 会把原始 RSSI 加上此偏移再代入公式，
 *     正值表示该手机灵敏度低于标准（实测值比理论更弱），补偿后测距更接近真实。
 */

import type { CalibrationProfile } from './types';

export const DEFAULT_CALIBRATION: CalibrationProfile = {
  txPower: -59,
  environmentFactor: 2.0,
  calibratedOffset: 0,
};

/** 距离上下限（防止奇异值） */
const MIN_DISTANCE = 0.1;
const MAX_DISTANCE = 50;

export function clampDistance(d: number): number {
  if (!Number.isFinite(d)) return MAX_DISTANCE;
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, d));
}

export class DistanceEstimator {
  private profile: CalibrationProfile;

  constructor(profile: CalibrationProfile = { ...DEFAULT_CALIBRATION }) {
    this.profile = { ...DEFAULT_CALIBRATION, ...profile };
  }

  setProfile(profile: CalibrationProfile): void {
    this.profile = { ...DEFAULT_CALIBRATION, ...profile };
  }

  getProfile(): CalibrationProfile {
    return { ...this.profile };
  }

  /**
   * 由原始 RSSI 估算距离（米）。
   * 当 RSSI 高于 txPower（极度接近）时给一个保守的近距底线，避免 0/负值。
   */
  estimate(rssi: number): number {
    const corrected = rssi + this.profile.calibratedOffset;
    const tx = this.profile.txPower;
    const n = Math.max(0.5, this.profile.environmentFactor);

    if (!Number.isFinite(rssi)) return MAX_DISTANCE;
    if (corrected > tx) return 0.3; // 信号强于 1 米参考 => 视为极近，给底线

    const distance = Math.pow(10, (tx - corrected) / (10 * n));
    return clampDistance(distance);
  }

  /**
   * 静态估算：依据传入的自定义模型参数。
   */
  static estimate(rssi: number, profile: CalibrationProfile = DEFAULT_CALIBRATION): number {
    return new DistanceEstimator(profile).estimate(rssi);
  }
}

/**
 * 依据一段 RSSI 样本估算其对应的距离区间（用于调试/展示波动范围）。
 */
export function rssiToDistanceRange(
  samples: number[],
  profile: CalibrationProfile = DEFAULT_CALIBRATION
): { min: number; max: number; avg: number } | null {
  if (samples.length === 0) return null;
  const est = new DistanceEstimator(profile);
  const distances = samples.map((s) => est.estimate(s));
  return {
    min: Math.min(...distances),
    max: Math.max(...distances),
    avg: distances.reduce((a, b) => a + b, 0) / distances.length,
  };
}
/**
 * 距离校准模块（纯 TypeScript，可单元测试）
 *
 * 校准原理（参考 distanceEstimator 的路径损耗模型）：
 *
 *   RSSI = txPower - 10 * n * log10(d)
 *
 * 令 x = log10(d)，y = RSSI，则 y = a + b*x，其中：
 *   a = txPower（截距）
 *   b = -10 * n（斜率）
 *
 * 因此只要收集「已知距离 + 该处实测 RSSI」的若干组样本，
 * 用最小二乘线性回归即可同时标定 txPower 与路径损耗指数 n。
 *
 * calibratedOffset：同一信标在标准模型下的 1 米理论 RSSI（-59）与实际 1 米实测
 * 的差，用来补偿不同手机的射频增益差异 —— offset = txPower标准 - 实测1米RSSI。
 */

import type { CalibrationProfile } from './types';
import { DistanceEstimator } from './distanceEstimator';

export interface CalibrationSample {
  /** 已知真实距离（米） */
  distanceMeters: number;
  /** 该距离下实测 RSSI（滤波后） */
  rssi: number;
}

export interface CalibrationResult {
  ok: boolean;
  profile?: CalibrationProfile;
  message: string;
}

/** 最小二乘线性回归：返回 y = a + b*x 的 a、b */
function linearRegression(
  xs: number[],
  ys: number[]
): { a: number; b: number } {
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return { a: meanY, b: 0 };
  const b = num / den;
  const a = meanY - b * meanX;
  return { a, b };
}

/**
 * 用 ≥2 个不同距离的样本（距离必须有区分度）标定 txPower 与 n。
 */
export function calibrateFromSamples(
  samples: CalibrationSample[]
): CalibrationResult {
  if (samples.length < 2) {
    return { ok: false, message: '至少需要 2 组不同距离的校准样本（建议 3~5 组）' };
  }

  const xs = samples.map((s) => Math.log10(Math.max(0.5, s.distanceMeters)));
  const ys = samples.map((s) => s.rssi);

  // 检查距离是否有区分度（x 的方差太小会导致回归退化）
  const spread = Math.max(...xs) - Math.min(...xs);
  if (spread < 0.1) {
    return { ok: false, message: '校准样本的距离过近，请拉开距离（如 1m、3m、8m）' };
  }

  const { a, b } = linearRegression(xs, ys);
  const txPower = Math.round(a * 10) / 10;
  const environmentFactor = clampN(b);

  return {
    ok: true,
    profile: {
      txPower,
      environmentFactor,
      calibratedOffset: 0, // 由单点校准补充
    },
    message: `标定完成：txPower=${txPower}dBm，n=${environmentFactor}`,
  };
}

function clampN(b: number): number {
  // b = -10n => n = -b/10，限制在合理范围 1.5~4.5
  const n = -b / 10;
  if (!Number.isFinite(n)) return 2;
  return Math.min(4.5, Math.max(1.5, Math.round(n * 100) / 100));
}

/**
 * 手机射频差异补偿（单点校准）：
 * 在真实 1 米处采样一组 RSSI，求其均值，与「标准模型 1 米理论 RSSI」比对。
 *
 * 返回的 calibratedOffset 应叠加到 estimate 的 RSSI 上。
 */
export function calibratePhoneOffset(
  samplesAt1m: number[],
  theoreticalTxPowerAt1m = -59
): { ok: boolean; offset: number; message: string } {
  if (samplesAt1m.length < 3) {
    return { ok: false, offset: 0, message: '请在 1 米处至少采集 3 个 RSSI 样本' };
  }
  const mean = samplesAt1m.reduce((s, v) => s + v, 0) / samplesAt1m.length;
  const offset = Math.round((theoreticalTxPowerAt1m - mean) * 10) / 10;
  return {
    ok: true,
    offset,
    message: `1 米实测均值 ${Math.round(mean * 10) / 10}dBm，标准 ${theoreticalTxPowerAt1m}dBm，补偿 ${offset > 0 ? '+' : ''}${offset}dB`,
  };
}

/**
 * 便捷入口：给定一组样本 + 1 米实测样本，一步生成完整校准档案。
 */
export function buildCalibration(
  rangeSamples: CalibrationSample[],
  samplesAt1m: number[]
): CalibrationResult {
  const base = calibrateFromSamples(rangeSamples);
  if (!base.ok) return base;
  const phone = calibratePhoneOffset(samplesAt1m, base.profile!.txPower);
  return {
    ok: true,
    profile: {
      ...base.profile!,
      calibratedOffset: phone.offset,
    },
    message: `${base.message}；${phone.message}`,
  };
}

/**
 * 模拟/演示用校准样本生成器：基于给定真实 profile 生成带噪声的样本，
 * 方便无硬件时验证校准算法收敛到原参数。
 */
export function generateDemoSamples(
  profile: CalibrationProfile,
  distances: number[],
  noiseDb = 2
): CalibrationSample[] {
  const est = new DistanceEstimator(profile);
  return distances.map((d) => ({
    distanceMeters: d,
    rssi: sampleRssiAt(d, profile, noiseDb),
  }));
}

function sampleRssiAt(d: number, profile: CalibrationProfile, noiseDb: number): number {
  // 反向求解：rssi + offset = txPower - 10*n*log10(d)
  const rssi = profile.txPower - 10 * profile.environmentFactor * Math.log10(Math.max(0.5, d));
  return Math.round(rssi + (Math.random() * 2 - 1) * noiseDb);
}
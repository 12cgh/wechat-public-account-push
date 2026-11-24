/**
 * RSSI 滤波模块（纯 TypeScript，可单元测试）
 *
 * 策略：组合滤波 —— 先做小窗口「中值滤波」剔除突发离群值，
 * 再做「滑动平均」抑制高频抖动，最后用「指数平滑(EMA)」让结果更稳。
 *
 * 说明：RSSI 抖动通常来自多径反射与人体遮挡，单种滤波难以兼顾
 * 响应速度与稳定性，因此采用三段组合。
 */

export interface RssiFilterOptions {
  /** 滑动平均窗口大小 */
  windowSize?: number;
  /** 中值窗口大小（会自动调整为奇数） */
  medianSize?: number;
  /** EMA 平滑系数 0~1，越大越跟随（0 表示不启用 EMA） */
  alpha?: number;
}

export class RssiFilter {
  private readonly windowSize: number;
  private medianSize: number;
  private readonly alpha: number;
  private readonly raw: number[] = [];
  private smoothed: number | null = null;
  private lastRaw: number | null = null;

  constructor(options: RssiFilterOptions = {}) {
    this.windowSize = Math.max(1, options.windowSize ?? 6);
    this.medianSize = Math.max(3, options.medianSize ?? 5);
    this.alpha = options.alpha ?? 0.4;
    if (this.medianSize % 2 === 0) this.medianSize += 1; // 保证奇数窗口
  }

  /**
   * 推入一个新的原始 RSSI，返回当前滤波后的 RSSI。
   * 非法输入（非数值）会被忽略，维持上一次滤波值。
   */
  push(rssi: number): number {
    if (!Number.isFinite(rssi) || rssi < -110 || rssi > -10) {
      // 超出合理 BLE RSSI 区间的数据视为噪声
      return this.smoothed ?? rssi;
    }
    this.raw.push(rssi);
    this.lastRaw = rssi;
    if (this.raw.length > this.windowSize) this.raw.shift();

    const median = medianOf(this.raw.slice(-this.medianSize));
    const avg = this.raw.reduce((a, b) => a + b, 0) / this.raw.length;
    // 中值与均值各占一半：既抗离群点又保留趋势
    const combined = median * 0.5 + avg * 0.5;

    this.smoothed =
      this.smoothed === null
        ? combined
        : this.alpha * combined + (1 - this.alpha) * this.smoothed;

    return this.smoothed;
  }

  /** 当前滤波后的 RSSI（尚无数据时为 null） */
  get value(): number | null {
    return this.smoothed;
  }

  /** 最近一次原始 RSSI */
  get lastRawValue(): number | null {
    return this.lastRaw;
  }

  /** 已采集的原始样本数量 */
  get count(): number {
    return this.raw.length;
  }

  reset(): void {
    this.raw.length = 0;
    this.smoothed = null;
  }
}

/** 求数组的中位数（排序拷贝，不修改原数组） */
export function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
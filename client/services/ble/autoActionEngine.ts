/**
 * 自动动作引擎（纯 TypeScript，可单元测试）
 *
 * 职责：消费滤波后的距离读数，按照「解锁阈值 / 锁车阈值 / 防抖时间」
 * 自动触发 VehicleControl 的 lock/unlock，并把结果转成动作日志。
 *
 * 工作方式（双阈值滞回 + 防抖）：
 *   - 状态 locked：
 *       距离 < unlockThreshold 且持续 debounceMs → 触发 unlock → 状态 unlocked
 *       期间若回升超过 unlockThreshold + hysteresis → 重置防抖计时
 *   - 状态 unlocked：
 *       距离 > lockThreshold 且持续 debounceMs → 触发 lock → 状态 locked
 *       期间若回落低于 lockThreshold - hysteresis → 重置防抖计时
 *
 * 这样的设计避免阈值附近抖动导致重复动作。
 */

import type { ActionLogEntry, CarKeyState, DistanceReading, VehicleActionType } from './types';
import type { VehicleControl } from './vehicleControl';

export interface AutoActionEngineOptions {
  vehicle: VehicleControl;
  unlockThresholdM: number;
  lockThresholdM: number;
  debounceMs: number;
  /** 防抖重置回差（米） */
  hysteresisM?: number;
  /** 动作是否被授权的守卫（例如白名单校验），返回 false 时不触发动作并记录日志 */
  canAct?: () => boolean;
  /** 动作日志回调 */
  onAction?: (entry: ActionLogEntry) => void;
}

export class AutoActionEngine {
  private vehicle: VehicleControl;
  private unlockThresholdM: number;
  private lockThresholdM: number;
  private debounceMs: number;
  private hysteresisM: number;
  private canAct: () => boolean;
  private onAction?: (entry: ActionLogEntry) => void;

  private state: CarKeyState = 'locked';
  /** 进入触发区的时间戳，null 表示当前不在触发区 */
  private crossTime: number | null = null;
  private lastDistance: number | null = null;
  private actionInFlight = false;

  constructor(options: AutoActionEngineOptions) {
    this.vehicle = options.vehicle;
    this.unlockThresholdM = options.unlockThresholdM;
    this.lockThresholdM = options.lockThresholdM;
    this.debounceMs = options.debounceMs;
    this.hysteresisM = options.hysteresisM ?? 0.5;
    this.canAct = options.canAct ?? (() => true);
    this.onAction = options.onAction;
  }

  setThresholds(unlockThresholdM: number, lockThresholdM: number, debounceMs: number): void {
    this.unlockThresholdM = unlockThresholdM;
    this.lockThresholdM = lockThresholdM;
    this.debounceMs = debounceMs;
    this.resetDebounce();
  }

  getState(): CarKeyState {
    return this.state;
  }

  getLastDistance(): number | null {
    return this.lastDistance;
  }

  /** 设置新的车辆执行器（切换模拟/真实实现时调用） */
  setVehicle(vehicle: VehicleControl): void {
    this.vehicle = vehicle;
  }

  /**
   * 每次新的距离读数调用一次。
   */
  update(reading: DistanceReading): void {
    const d = reading.distance;
    if (!Number.isFinite(d)) return;
    this.lastDistance = d;
    const now = reading.timestamp;

    if (this.state === 'locked' || this.state === 'unlocking') {
      if (d < this.unlockThresholdM) {
        this.crossTime = this.crossTime ?? now;
        if (!this.actionInFlight && now - this.crossTime >= this.debounceMs) {
          void this.fire('unlock');
        }
      } else if (d > this.unlockThresholdM + this.hysteresisM) {
        this.crossTime = null; // 离开临界区，重置防抖
      }
    } else if (this.state === 'unlocked' || this.state === 'locking') {
      if (d > this.lockThresholdM) {
        this.crossTime = this.crossTime ?? now;
        if (!this.actionInFlight && now - this.crossTime >= this.debounceMs) {
          void this.fire('lock');
        }
      } else if (d < this.lockThresholdM - this.hysteresisM) {
        this.crossTime = null;
      }
    }
  }

  /** 手动解锁（不受白名单/阈值限制，直接执行） */
  async manualUnlock(): Promise<ActionLogEntry> {
    return this.fireManual('unlock');
  }

  /** 手动锁车 */
  async manualLock(): Promise<ActionLogEntry> {
    return this.fireManual('lock');
  }

  private async fireManual(action: VehicleActionType): Promise<ActionLogEntry> {
    const result = await this.vehicle[action]('manual');
    const entry = this.buildEntry(action, 'manual', result.ok, result.message);
    if (result.ok) {
      this.state = action === 'unlock' ? 'unlocked' : 'locked';
      this.resetDebounce();
    }
    this.onAction?.(entry);
    return entry;
  }

  private async fire(action: VehicleActionType): Promise<void> {
    if (!this.canAct()) {
      const entry = this.buildEntry(action, 'auto', false, '自动动作被白名单拦截，未授权设备');
      this.onAction?.(entry);
      this.resetDebounce();
      return;
    }
    this.actionInFlight = true;
    try {
      const result = await this.vehicle[action]('auto');
      const entry = this.buildEntry(action, 'auto', result.ok, result.message);
      if (result.ok) {
        this.state = action === 'unlock' ? 'unlocked' : 'locked';
      }
      this.onAction?.(entry);
    } finally {
      this.actionInFlight = false;
      this.resetDebounce();
    }
  }

  private buildEntry(
    action: VehicleActionType,
    source: 'auto' | 'manual',
    ok: boolean,
    message: string
  ): ActionLogEntry {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action,
      source,
      distance: this.lastDistance,
      vehicleControlId: this.vehicle.id,
      ok,
      message,
      timestamp: Date.now(),
    };
  }

  private resetDebounce(): void {
    this.crossTime = null;
  }

  /** 重置引擎为初始锁定状态（设置大幅变更时调用） */
  reset(): void {
    this.state = 'locked';
    this.crossTime = null;
    this.lastDistance = null;
    this.actionInFlight = false;
  }
}
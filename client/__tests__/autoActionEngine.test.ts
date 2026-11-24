/**
 * 自动动作引擎单元测试
 */
import { AutoActionEngine } from '../services/ble/autoActionEngine';
import { SimulatedVehicleControl } from '../services/ble/vehicleControl';
import type { ActionLogEntry, DistanceReading } from '../services/ble/types';

function reading(distance: number, timestamp = Date.now()): DistanceReading {
  return {
    deviceId: 'test',
    rawRssi: -60,
    rssi: -60,
    distance,
    quality: 0.8,
    timestamp,
  };
}

function createEngine(overrides: Partial<ConstructorParameters<typeof AutoActionEngine>[0]> = {}) {
  const vehicle = new SimulatedVehicleControl();
  const logs: ActionLogEntry[] = [];
  const engine = new AutoActionEngine({
    vehicle,
    unlockThresholdM: 2,
    lockThresholdM: 10,
    debounceMs: 3000,
    hysteresisM: 0.5,
    onAction: (e) => logs.push(e),
    ...overrides,
  });
  return { engine, vehicle, logs };
}

const T = 1000; // 每次读数间隔 1s

describe('AutoActionEngine - 接近自动解锁', () => {
  it('低于解锁阈值且持续防抖时间后触发 unlock', async () => {
    const { engine, logs } = createEngine();
    let t = Date.now();
    // 从 11m 逐步走近
    engine.update(reading(11, t));
    engine.update(reading(6, (t += T)));
    engine.update(reading(1.5, (t += T)));
    engine.update(reading(1.2, (t += T)));
    // 已持续低于阈值 2s < debounce 3s，不应触发
    expect(engine.getState()).toBe('locked');
    expect(logs.length).toBe(0);

    // 再持续 2s，超过 debounce
    engine.update(reading(1.0, (t += T)));
    engine.update(reading(0.8, (t += T)));
    await new Promise((r) => setTimeout(r, 20));
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('unlock');
    expect(logs[0].source).toBe('auto');
    expect(logs[0].ok).toBe(true);
    expect(engine.getState()).toBe('unlocked');
  });

  it('防抖期内回到阈值外则重置，不会触发', async () => {
    const { engine, logs } = createEngine();
    let t = Date.now();
    engine.update(reading(11, t));
    engine.update(reading(1.5, (t += T)));
    engine.update(reading(1.8, (t += T)));
    engine.update(reading(3.5, (t += T))); // 回升超过 unlock+hysteresis(2.5)
    engine.update(reading(1.2, (t += T))); // 再次进入，重新计时
    engine.update(reading(1.0, (t += T)));
    await new Promise((r) => setTimeout(r, 20));
    expect(engine.getState()).toBe('locked');
    expect(logs.length).toBe(0);
  });

  it('离开锁车阈值且持续防抖时间后触发 lock', async () => {
    const { engine, logs } = createEngine();
    let t = Date.now();
    // 先解锁：快速进入并等待防抖
    engine.update(reading(1, (t += T)));
    engine.update(reading(0.8, (t += T)));
    engine.update(reading(0.9, (t += T)));
    engine.update(reading(0.7, (t += T)));
    await new Promise((r) => setTimeout(r, 20));
    expect(engine.getState()).toBe('unlocked');
    logs.length = 0;

    // 走远
    engine.update(reading(6, (t += T)));
    engine.update(reading(11, (t += T)));
    engine.update(reading(11.5, (t += T)));
    engine.update(reading(12, (t += T)));
    engine.update(reading(12.5, (t += T))); // 持续超过锁车阈值 3s → 触发 lock
    await new Promise((r) => setTimeout(r, 20));
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('lock');
    expect(engine.getState()).toBe('locked');
  });

  it('防抖期内回到锁车阈值内则重置', async () => {
    const { engine, logs } = createEngine();
    let t = Date.now();
    engine.update(reading(1, (t += T)));
    engine.update(reading(0.8, (t += T)));
    engine.update(reading(0.9, (t += T)));
    engine.update(reading(0.7, (t += T)));
    await new Promise((r) => setTimeout(r, 20));
    logs.length = 0;

    engine.update(reading(11, (t += T)));
    engine.update(reading(9, (t += T))); // 回到 lock-hysteresis(9.5) 内
    engine.update(reading(12, (t += T)));
    await new Promise((r) => setTimeout(r, 20));
    expect(logs.length).toBe(0);
  });
});

describe('AutoActionEngine - 手动动作与白名单', () => {
  it('手动解锁直接执行并更新状态', async () => {
    const { engine, logs } = createEngine();
    const entry = await engine.manualUnlock();
    expect(entry.action).toBe('unlock');
    expect(entry.source).toBe('manual');
    expect(engine.getState()).toBe('unlocked');
    expect(logs.length).toBe(1);
  });

  it('canAct 返回 false 时自动动作被拦截并记录日志', async () => {
    const { engine, logs } = createEngine({
      canAct: () => false,
    });
    let t = Date.now();
    engine.update(reading(1, (t += T)));
    engine.update(reading(0.8, (t += T)));
    engine.update(reading(0.9, (t += T)));
    engine.update(reading(0.7, (t += T)));
    await new Promise((r) => setTimeout(r, 20));
    expect(logs.length).toBe(1);
    expect(logs[0].ok).toBe(false);
    expect(logs[0].message).toContain('白名单');
    expect(engine.getState()).toBe('locked');
  });

  it('setThresholds 更新后生效', async () => {
    const { engine, logs } = createEngine();
    engine.setThresholds(5, 20, 1000);
    let t = Date.now();
    engine.update(reading(4, (t += T)));
    engine.update(reading(3.5, (t += T)));
    await new Promise((r) => setTimeout(r, 20));
    expect(logs[0].action).toBe('unlock');
  });

  it('reset 回到锁定状态', async () => {
    const { engine } = createEngine();
    await engine.manualUnlock();
    expect(engine.getState()).toBe('unlocked');
    engine.reset();
    expect(engine.getState()).toBe('locked');
  });
});
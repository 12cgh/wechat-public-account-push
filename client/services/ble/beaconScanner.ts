/**
 * 信标扫描器抽象与两种实现
 *
 *  - IBeaconScanner：统一扫描器接口
 *  - BleBeaconScanner：真实 BLE 中心设备扫描（基于 react-native-ble-plx）
 *      * 读取广播 RSSI，解析 iBeacon（UUID/Major/Minor/TxPower）
 *      * 处理 Android 12+ 邻近权限 / iOS 定位权限
 *      * 低功耗扫描参数（Android LowPower 占空比）
 *  - SimulatedBeaconScanner：模拟信标（无硬件演示 / Web 预览），
 *      输出一段「接近 → 停留 → 离开」的轨迹，便于验证距离展示与自动动作。
 */

import { Platform, PermissionsAndroid } from 'react-native';
import * as Location from 'expo-location';
import { BleManager, ScanMode } from 'react-native-ble-plx';
import { parseIBeaconManufacturerData, uuidMatches } from './iBeaconParser';
import type { BeaconFilter, BeaconReading, ScannerStatus } from './types';

export interface IBeaconScanner {
  start(): Promise<void>;
  stop(): Promise<void>;
  setFilter(filter: BeaconFilter): void;
  onChange(listener: (reading: BeaconReading) => void): () => void;
  onStatus(listener: (status: ScannerStatus) => void): () => void;
  getStatus(): ScannerStatus;
  readonly isSimulated: boolean;
}

type ChangeListener = (reading: BeaconReading) => void;
type StatusListener = (status: ScannerStatus) => void;

/** ==================== 真实 BLE 实现 ==================== */

export class BleBeaconScanner implements IBeaconScanner {
  readonly isSimulated = false;

  private manager: BleManager | null = null;
  private scanning = false;
  private filter: BeaconFilter = {};
  private status: ScannerStatus = 'idle';
  private changeListeners = new Set<ChangeListener>();
  private statusListeners = new Set<StatusListener>();
  /** 是否使用低功耗扫描（Android: LowPower 占空比） */
  private lowPower: boolean;

  constructor(options: { lowPower?: boolean } = {}) {
    this.lowPower = options.lowPower ?? true;
  }

  setLowPower(lowPower: boolean): void {
    this.lowPower = lowPower;
  }

  async start(): Promise<void> {
    if (this.scanning) return;
    this.setStatus('starting');
    try {
      const granted = await this.ensurePermissions();
      if (!granted) {
        this.setStatus('unauthorized');
        console.warn('[BLE] 权限未授予，无法扫描');
        return;
      }

      this.manager = new BleManager();
      const state = await this.manager.state();
      if (state !== 'PoweredOn') {
        this.setStatus('bluetooth-off');
        console.warn('[BLE] 蓝牙未开启，当前状态:', state);
        return;
      }

      await this.manager.startDeviceScan(
        null, // 扫描所有外设（iBeacon 通过 Manufacturer Data 广播，无 GATT service UUID）
        {
          allowDuplicates: true, // 需要连续 RSSI 采样，必须允许重复广播
          scanMode: this.lowPower ? ScanMode.LowPower : ScanMode.Balanced,
        },
        (error, device) => {
          if (error) {
            console.warn('[BLE] 扫描错误:', error.message);
            return;
          }
          if (!device) return;
          const reading = this.toReading(device);
          if (this.matches(reading)) {
            this.emitChange(reading);
          }
        }
      );

      this.scanning = true;
      this.setStatus('scanning');
    } catch (e) {
      this.setStatus('error');
      console.warn('[BLE] 启动扫描失败:', e);
    }
  }

  async stop(): Promise<void> {
    if (!this.scanning && !this.manager) return;
    this.setStatus('stopping');
    try {
      await this.manager?.stopDeviceScan();
    } catch (e) {
      console.warn('[BLE] 停止扫描失败:', e);
    }
    this.scanning = false;
    this.setStatus('idle');
  }

  setFilter(filter: BeaconFilter): void {
    this.filter = filter;
  }

  onChange(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): ScannerStatus {
    return this.status;
  }

  private toReading(device: {
    id: string;
    name: string | null;
    rssi: number | null;
    manufacturerData: string | null;
    txPowerLevel: number | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } & Record<string, any>): BeaconReading {
    const beacon = parseIBeaconManufacturerData(device.manufacturerData);
    return {
      id: device.id,
      name: device.name,
      rssi: device.rssi ?? -127,
      txPower: beacon?.txPower ?? device.txPowerLevel ?? undefined,
      uuid: beacon?.uuid,
      major: beacon?.major,
      minor: beacon?.minor,
      timestamp: Date.now(),
    };
  }

  private matches(reading: BeaconReading): boolean {
    const { uuid, mac } = this.filter;
    if (uuid && !uuidMatches(uuid, reading.uuid)) return false;
    if (mac && !reading.id.toLowerCase().includes(mac.trim().toLowerCase())) return false;
    return true;
  }

  /**
   * 权限处理：
   *  - Android 12+（API 31）：BLUETOOTH_SCAN / BLUETOOTH_CONNECT 为运行时「邻近权限」。
   *    Expo 官方未封装该权限，react-native-ble-plx 官方推荐用 PermissionsAndroid 请求。
   *  - Android 6~11：需要定位权限（清单中已声明 maxSdkVersion=30）。
   *  - iOS：CoreBluetooth 扫描需要「定位权限」提示（BLE 会被用于判断距离/位置）。
   */
  private async ensurePermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const apiLevel = Platform.Version as number;
      if (apiLevel >= 31) {
        const results = await PermissionsAndroid.requestMultiple([
          'android.permission.BLUETOOTH_SCAN',
          'android.permission.BLUETOOTH_CONNECT',
        ]);
        return results['android.permission.BLUETOOTH_SCAN'] === 'granted';
      }
      const loc = await Location.requestForegroundPermissionsAsync();
      return loc.status === 'granted';
    }
    if (Platform.OS === 'ios') {
      const loc = await Location.requestForegroundPermissionsAsync();
      return loc.status === 'granted';
    }
    // web 等平台不支持原生 BLE，交给上层回退到模拟模式
    return false;
  }

  private setStatus(next: ScannerStatus): void {
    this.status = next;
    this.statusListeners.forEach((l) => l(next));
  }

  private emitChange(reading: BeaconReading): void {
    this.changeListeners.forEach((l) => l(reading));
  }
}

/** ==================== 模拟实现 ==================== */

const SCENE_DURATION = 40; // 一次完整场景：40 秒
const SCAN_INTERVAL = 500; // 模拟广播间隔 ms

/**
 * 输出一条模拟轨迹（单位：米）：
 * 0-10s   从 11m 走近到 0.6m（跨过锁车阈值与解锁阈值）
 * 10-20s  在 0.6m 附近停留（解锁区内稳定）
 * 20-32s  走远到 12m（跨过锁车阈值）
 * 32-40s  在 12m 外保持（锁车区外稳定）
 */
export function simulatedDistanceAt(t: number): number {
  const phase = t % SCENE_DURATION;
  if (phase < 10) {
    return 11 - (11 - 0.6) * (phase / 10);
  }
  if (phase < 20) {
    return 0.6 + 0.15 * Math.sin(phase * 0.8);
  }
  if (phase < 32) {
    return 0.6 + (12 - 0.6) * ((phase - 20) / 12);
  }
  return 12 - 0.5 * Math.sin((phase - 32) * 0.5);
}

export class SimulatedBeaconScanner implements IBeaconScanner {
  readonly isSimulated = true;

  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private filter: BeaconFilter = {};
  private status: ScannerStatus = 'idle';
  private changeListeners = new Set<ChangeListener>();
  private statusListeners = new Set<StatusListener>();

  async start(): Promise<void> {
    if (this.timer) return;
    this.tick = 0;
    this.setStatus('scanning');
    // 模拟一个 BLE 广播流（使用 setTimeout 而非精确 interval，模拟真实广播 jitter）
    const loop = () => {
      this.tick += 1;
      const t = this.tick * 0.5;
      const distance = simulatedDistanceAt(t);
      const rssi = Math.round(simulateRssiAt(distance));
      const reading: BeaconReading = {
        id: 'SIM-BEACON-0001',
        name: 'Simulated Beacon',
        rssi,
        txPower: -59,
        uuid: 'E2C56DB5-DFFB-48D2-B060-D0F5A71096E0',
        major: 1,
        minor: 1,
        timestamp: Date.now(),
      };
      if (this.matches(reading)) this.emitChange(reading);
      this.timer = setTimeout(loop, SCAN_INTERVAL + Math.random() * 120);
    };
    loop();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.setStatus('idle');
  }

  setFilter(filter: BeaconFilter): void {
    this.filter = filter;
  }

  onChange(listener: ChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  getStatus(): ScannerStatus {
    return this.status;
  }

  private matches(reading: BeaconReading): boolean {
    const { uuid, mac } = this.filter;
    if (uuid && !uuidMatches(uuid, reading.uuid)) return false;
    if (mac && !reading.id.toLowerCase().includes(mac.trim().toLowerCase())) return false;
    return true;
  }

  private setStatus(next: ScannerStatus): void {
    this.status = next;
    this.statusListeners.forEach((l) => l(next));
  }

  private emitChange(reading: BeaconReading): void {
    this.changeListeners.forEach((l) => l(reading));
  }
}

/** 依据距离反向生成模拟 RSSI：rssi = -59 - 20*log10(d) + 噪声 */
export function simulateRssiAt(distance: number, txPower = -59, noise = 3): number {
  const ideal = txPower - 10 * 2 * Math.log10(Math.max(0.3, distance));
  return ideal + (Math.random() * 2 - 1) * noise;
}
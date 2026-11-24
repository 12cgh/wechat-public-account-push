/**
 * 扫描器工厂：根据设置选择「真实 BLE」或「模拟信标」实现。
 * 在两个平台（原生 / Web / Expo Go）都能给出可运行的演示路径。
 */

import { BleBeaconScanner, IBeaconScanner, SimulatedBeaconScanner } from './beaconScanner';

export type ScannerMode = 'ble' | 'simulated';

export function createBeaconScanner(mode: ScannerMode, lowPower = true): IBeaconScanner {
  if (mode === 'ble') {
    return new BleBeaconScanner({ lowPower });
  }
  return new SimulatedBeaconScanner();
}
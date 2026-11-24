/**
 * 设置持久化（AsyncStorage）
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CarKeySettings } from './ble/types';

export const DEFAULT_SETTINGS: CarKeySettings = {
  unlockThresholdM: 2,
  lockThresholdM: 10,
  scanIntervalMs: 1500,
  debounceMs: 8000,
  beaconUuid: '',
  beaconMacFilter: '',
  simulationMode: true, // 默认模拟模式，便于无硬件演示；接入真实信标后改为 false
  lowPowerMode: true,
  autoActionsEnabled: true,
  enableNotifications: true,
  vehicleImpl: 'simulated', // 默认模拟执行器；接入真实车厂后切换为 tesla
  whitelistEnabled: false,
  whitelist: [],
  calibration: {
    txPower: -59,
    environmentFactor: 2.0,
    calibratedOffset: 0,
  },
};

const STORAGE_KEY = 'car-key-settings-v1';

export async function loadSettings(): Promise<CarKeySettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CarKeySettings>;
    return deepMergeSettings(DEFAULT_SETTINGS, parsed);
  } catch (e) {
    console.warn('[SettingsStore] 读取设置失败，使用默认值', e);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: CarKeySettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn('[SettingsStore] 保存设置失败', e);
  }
}

/** 深合并，保证新增字段有默认值且校准对象完整 */
function deepMergeSettings(base: CarKeySettings, patch: Partial<CarKeySettings>): CarKeySettings {
  return {
    ...base,
    ...patch,
    calibration: {
      ...base.calibration,
      ...(patch.calibration ?? {}),
    },
    whitelist: Array.isArray(patch.whitelist) ? patch.whitelist : base.whitelist,
  };
}
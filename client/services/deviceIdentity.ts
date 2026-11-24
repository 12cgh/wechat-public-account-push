/**
 * 设备标识：生成一次并全局持久化（expo-crypto + AsyncStorage）
 * 用于「白名单手机」校验 —— 只有被加入白名单的设备才允许触发自动动作。
 */

import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'car-key-device-id';

let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
  } catch (e) {
    console.warn('[DeviceIdentity] 读取本地设备 ID 失败', e);
  }
  const id = Crypto.randomUUID();
  cached = id;
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  } catch (e) {
    console.warn('[DeviceIdentity] 保存设备 ID 失败', e);
  }
  return id;
}
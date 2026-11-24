/**
 * 系统通知服务（expo-notifications）
 * 在自动/手动动作触发时向用户发送本地通知。
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { ActionLogEntry } from './ble/types';

// 前台也允许显示通知横幅
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permissionRequested = false;

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (permissionRequested) return current.granted;
    permissionRequested = true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch (e) {
    console.warn('[Notification] 权限请求失败', e);
    return false;
  }
}

/** Android 通知渠道 */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('car-key-actions', {
      name: '车辆动作',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
  } catch (e) {
    console.warn('[Notification] 创建渠道失败', e);
  }
}

export async function notifyAction(entry: ActionLogEntry): Promise<void> {
  try {
    await ensureAndroidChannel();
    const title =
      entry.action === 'unlock'
        ? entry.ok
          ? '车辆已解锁'
          : '解锁失败'
        : entry.ok
          ? '车辆已上锁'
          : '上锁失败';
    const distanceText = entry.distance !== null ? `（距离约 ${entry.distance.toFixed(1)}m）` : '';
    const sourceText = entry.source === 'manual' ? '手动' : '自动';
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: `${sourceText}触发：${entry.message}${distanceText}`,
        data: { action: entry.action, entryId: entry.id },
      },
      trigger: null, // 立即显示
    });
  } catch (e) {
    console.warn('[Notification] 发送通知失败', e);
  }
}
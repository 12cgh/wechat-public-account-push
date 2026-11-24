/**
 * CarKeyContext —— 蓝牙车钥匙全局状态编排
 *
 * 串联：信标扫描器 → RSSI 滤波 → 距离估算 → 自动动作引擎 → 车辆执行器，
 * 并为 UI（主页 / 设置页）提供稳定上下文。
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AutoActionEngine } from '@/services/ble/autoActionEngine';
import { createBeaconScanner } from '@/services/ble/scannerFactory';
import type { IBeaconScanner } from '@/services/ble/beaconScanner';
import { DistanceEstimator } from '@/services/ble/distanceEstimator';
import { RssiFilter } from '@/services/ble/rssiFilter';
import { createVehicleControl } from '@/services/ble/vehicleControlRegistry';
import type {
  ActionLogEntry,
  BeaconReading,
  CarKeySettings,
  CarKeyState,
  DistanceReading,
  ScannerStatus,
} from '@/services/ble/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/services/settingsStore';
import { getDeviceId } from '@/services/deviceIdentity';
import { ensureNotificationPermission, notifyAction } from '@/services/notificationService';

/** 依据滤波样本数与 RSSI 得到 0..1 信号质量 */
function computeQuality(sampleCount: number, rssi: number): number {
  let q = Math.min(1, sampleCount / 8) * 0.6;
  q += Math.max(0, 1 - Math.abs(rssi + 60) / 40) * 0.4;
  return Math.min(1, Math.max(0, q));
}

export interface CarKeyContextValue {
  /** 应用初始化完成（设置/设备ID已加载） */
  ready: boolean;
  settings: CarKeySettings;
  updateSettings: (patch: Partial<CarKeySettings>) => Promise<void>;
  deviceId: string | null;

  /** 扫描开关 */
  active: boolean;
  setActive: (v: boolean) => Promise<void>;
  scannerStatus: ScannerStatus;
  /** 最近信标广播信息（设备名/原始RSSI等） */
  lastBeacon: BeaconReading | null;
  /** 最近距离读数（滤波后） */
  lastReading: DistanceReading | null;

  carState: CarKeyState;
  actionLogs: ActionLogEntry[];
  manualLock: () => Promise<void>;
  manualUnlock: () => Promise<void>;
  notifyPermission: boolean;
  resetSession: () => Promise<void>;
}

const CarKeyContext = createContext<CarKeyContextValue | null>(null);

export function CarKeyProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<CarKeySettings>(DEFAULT_SETTINGS);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<ScannerStatus>('idle');
  const [lastBeacon, setLastBeacon] = useState<BeaconReading | null>(null);
  const [lastReading, setLastReading] = useState<DistanceReading | null>(null);
  const [carState, setCarState] = useState<CarKeyState>('unknown');
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);
  const [notifyPermission, setNotifyPermission] = useState(false);

  // --- refs（供引擎回调/异步逻辑读取最新值，避免闭包过期） ---
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const deviceIdRef = useRef(deviceId);
  deviceIdRef.current = deviceId;
  const scannerRef = useRef<IBeaconScanner | null>(null);
  const filterRef = useRef(new RssiFilter());
  const estimatorRef = useRef(new DistanceEstimator());

  // --- 自动动作引擎（仅创建一次，阈值/执行器通过 setter 更新） ---
  const engineRef = useRef<AutoActionEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new AutoActionEngine({
      vehicle: createVehicleControl('simulated'),
      unlockThresholdM: DEFAULT_SETTINGS.unlockThresholdM,
      lockThresholdM: DEFAULT_SETTINGS.lockThresholdM,
      debounceMs: DEFAULT_SETTINGS.debounceMs,
      canAct: () => {
        const s = settingsRef.current;
        if (!s.whitelistEnabled) return true;
        return s.whitelist.includes(deviceIdRef.current ?? '');
      },
      onAction: (entry) => {
        setActionLogs((prev) => [entry, ...prev].slice(0, 60));
        setCarState(deriveStateFromAction(entry));
        const s = settingsRef.current;
        if (s.enableNotifications) void notifyAction(entry);
      },
    });
  }

  // --- 初始加载 ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, id] = await Promise.all([loadSettings(), getDeviceId()]);
        if (cancelled) return;
        setSettings(s);
        setDeviceId(id);
        estimatorRef.current.setProfile(s.calibration);
        engineRef.current?.setThresholds(s.unlockThresholdM, s.lockThresholdM, s.debounceMs);
        engineRef.current?.setVehicle(createVehicleControl(s.vehicleImpl));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- 扫描器生命周期（模式/滤波/低功耗变化时重建） ---
  useEffect(() => {
    if (!active || !ready) return;
    const mode = settings.simulationMode ? 'simulated' : 'ble';
    const scanner = createBeaconScanner(mode, settings.lowPowerMode);
    scannerRef.current = scanner;
    scanner.setFilter({
      uuid: settings.beaconUuid || undefined,
      mac: settings.beaconMacFilter || undefined,
    });

    const offStatus = scanner.onStatus((s) => setScannerStatus(s));
    const offChange = scanner.onChange((r) => {
      filterRef.current.push(r.rssi);
      setLastBeacon(r);
    });

    void scanner.start();
    return () => {
      offStatus();
      offChange();
      filterRef.current.reset();
      void scanner.stop();
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, settings.simulationMode, settings.lowPowerMode, settings.beaconUuid, settings.beaconMacFilter]);

  // --- 估值主环路（按扫描间隔节流） ---
  useEffect(() => {
    if (!active || !ready) return;
    const pushReading = () => {
      const rssi = filterRef.current.value;
      if (rssi === null) return;
      const rawRssi = filterRef.current.lastRawValue ?? rssi;
      const distance = estimatorRef.current.estimate(rssi);
      const reading: DistanceReading = {
        deviceId: lastBeacon?.id ?? 'beacon',
        rawRssi,
        rssi,
        distance,
        quality: computeQuality(filterRef.current.count, rssi),
        timestamp: Date.now(),
      };
      setLastReading(reading);
      if (settingsRef.current.autoActionsEnabled) {
        engineRef.current?.update(reading);
      }
    };
    pushReading();
    const iv = setInterval(pushReading, Math.max(250, settings.scanIntervalMs));
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, settings.scanIntervalMs, settings.autoActionsEnabled, lastBeacon?.id]);

  // --- 阈值/防抖/执行器变化同步到引擎 ---
  useEffect(() => {
    engineRef.current?.setThresholds(settings.unlockThresholdM, settings.lockThresholdM, settings.debounceMs);
  }, [settings.unlockThresholdM, settings.lockThresholdM, settings.debounceMs]);

  useEffect(() => {
    engineRef.current?.setVehicle(createVehicleControl(settings.vehicleImpl));
  }, [settings.vehicleImpl]);

  // --- 交互动作 ---
  const updateSettings = useCallback(async (patch: Partial<CarKeySettings>) => {
    setSettings((prev) => {
      const next: CarKeySettings = {
        ...prev,
        ...patch,
        calibration: { ...prev.calibration, ...(patch.calibration ?? {}) },
        whitelist: Array.isArray(patch.whitelist) ? patch.whitelist : prev.whitelist,
      };
      if (patch.calibration) estimatorRef.current.setProfile(next.calibration);
      void saveSettings(next);
      return next;
    });
  }, []);

  const toggleActive = useCallback(async (v: boolean) => {
    setActive(v);
    if (!v) {
      setScannerStatus('idle');
      setLastReading(null);
    }
  }, []);

  const manualLock = useCallback(async () => {
    await engineRef.current?.manualLock();
  }, []);

  const manualUnlock = useCallback(async () => {
    await engineRef.current?.manualUnlock();
  }, []);

  const resetSession = useCallback(async () => {
    filterRef.current.reset();
    engineRef.current?.reset();
    setActionLogs([]);
    setLastReading(null);
    setLastBeacon(null);
    setCarState('locked');
  }, []);

  // --- 通知权限（启动时请求一次） ---
  useEffect(() => {
    let cancelled = false;
    if (ready) {
      void ensureNotificationPermission().then((ok) => {
        if (!cancelled) setNotifyPermission(ok);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const value = useMemo<CarKeyContextValue>(
    () => ({
      ready,
      settings,
      updateSettings,
      deviceId,
      active,
      setActive: toggleActive,
      scannerStatus,
      lastBeacon,
      lastReading,
      carState,
      actionLogs,
      manualLock,
      manualUnlock,
      notifyPermission,
      resetSession,
    }),
    [
      ready,
      settings,
      updateSettings,
      deviceId,
      active,
      toggleActive,
      scannerStatus,
      lastBeacon,
      lastReading,
      carState,
      actionLogs,
      manualLock,
      manualUnlock,
      notifyPermission,
      resetSession,
    ]
  );

  return <CarKeyContext.Provider value={value}>{children}</CarKeyContext.Provider>;
}

function deriveStateFromAction(entry: ActionLogEntry): CarKeyState {
  if (entry.action === 'unlock') return entry.ok ? 'unlocked' : 'locking';
  return entry.ok ? 'locked' : 'unlocking';
}

export function useCarKey(): CarKeyContextValue {
  const ctx = useContext(CarKeyContext);
  if (!ctx) throw new Error('useCarKey 必须在 CarKeyProvider 内使用');
  return ctx;
}
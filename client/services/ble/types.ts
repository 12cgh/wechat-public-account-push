/**
 * 蓝牙车钥匙核心类型定义
 */

/** 车辆动作类型 */
export type VehicleActionType = 'lock' | 'unlock';

/** 扫描器状态 */
export type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'stopping'
  | 'error'
  | 'unauthorized'
  | 'bluetooth-off';

/** 车辆状态（自动动作引擎的顶层状态机） */
export type CarKeyState =
  | 'unknown'      // 尚未确定
  | 'locked'       // 已锁车
  | 'unlocking'    // 正在解锁
  | 'unlocked'     // 已解锁
  | 'locking'      // 正在锁车
  | 'error';       // 出错

/** 单次 BLE 广播读数（原始信号） */
export interface BeaconReading {
  /** 设备标识（MAC / 系统 UUID），用于过滤与去重 */
  id: string;
  /** 广播名称，可能为空 */
  name: string | null;
  /** RSSI (dBm) */
  rssi: number;
  /** 信标声明的发射功率 (dBm @1m)，未知时为空 */
  txPower?: number;
  /** iBeacon UUID（解析到才存在） */
  uuid?: string;
  major?: number;
  minor?: number;
  /** 读数时间戳 (ms) */
  timestamp: number;
}

/** 滤波后的距离读数（喂给自动动作引擎的输入） */
export interface DistanceReading {
  /** 设备标识 */
  deviceId: string;
  /** 原始 RSSI (dBm) */
  rawRssi: number;
  /** 滤波后 RSSI (dBm) */
  rssi: number;
  /** 估算距离（米） */
  distance: number;
  /** 信号质量 0..1（越大越稳定） */
  quality: number;
  /** 读数时间戳 (ms) */
  timestamp: number;
}

/** 信标过滤条件 */
export interface BeaconFilter {
  /** iBeacon UUID 过滤，空串表示不过滤 */
  uuid?: string;
  /** 设备标识（MAC/ID）过滤，支持子串匹配，空串表示不过滤 */
  mac?: string;
}

/** 距离校准参数 */
export interface CalibrationProfile {
  /** 1 米处参考 RSSI（dBm），标准 iBeacon 通常为 -59 */
  txPower: number;
  /** 路径损耗指数 n（开阔空间约 2.0，室内约 2.5~3.0） */
  environmentFactor: number;
  /** 手机射频差异补偿（dB），正值表示该手机灵敏度低于标准 */
  calibratedOffset: number;
}

/** 应用设置 */
export interface CarKeySettings {
  /** 解锁阈值（米），进入此距离内触发解锁 */
  unlockThresholdM: number;
  /** 锁车阈值（米），离开到此距离外触发锁车 */
  lockThresholdM: number;
  /** 扫描间隔（ms），控制估值刷新频率 */
  scanIntervalMs: number;
  /** 防抖时间（ms），连续处于触发区多久才触发动作 */
  debounceMs: number;
  /** iBeacon UUID 过滤 */
  beaconUuid: string;
  /** 信标 MAC/设备 ID 过滤 */
  beaconMacFilter: string;
  /** 模拟信标模式（无硬件演示） */
  simulationMode: boolean;
  /** 低功耗扫描（Android LowPower / 降低占空比） */
  lowPowerMode: boolean;
  /** 是否启用自动动作 */
  autoActionsEnabled: boolean;
  /** 动作触发时是否发送系统通知 */
  enableNotifications: boolean;
  /** 车辆执行器实现（simulated 演示 / tesla 骨架 / noop 禁用） */
  vehicleImpl: 'simulated' | 'tesla' | 'noop';
  /** 是否启用白名单校验 */
  whitelistEnabled: boolean;
  /** 白名单设备 ID 列表 */
  whitelist: string[];
  /** 距离校准参数 */
  calibration: CalibrationProfile;
}

/** 动作日志条目 */
export interface ActionLogEntry {
  id: string;
  action: VehicleActionType;
  /** auto=自动触发 manual=手动触发 */
  source: 'auto' | 'manual';
  /** 触发时的估算距离（米），可能为空 */
  distance: number | null;
  /** 使用的车辆控制实现 ID */
  vehicleControlId: string;
  ok: boolean;
  message: string;
  timestamp: number;
}
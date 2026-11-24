/**
 * 车辆控制实现注册表
 *
 * 让上层（CarKeyContext / 设置页）能按 ID 选择执行器。
 * 接入真实车厂 API 时：新增实现类后，在 list 中注册即可。
 */

import {
  NoopVehicleControl,
  SimulatedVehicleControl,
  TeslaVehicleControl,
  type VehicleControl,
} from './vehicleControl';

export interface VehicleControlEntry {
  id: string;
  name: string;
  description: string;
  isAvailable: boolean;
  factory: () => VehicleControl;
}

export function listVehicleControls(hasTeslaCredential = false): VehicleControlEntry[] {
  return [
    {
      id: 'simulated',
      name: '模拟执行器（演示）',
      description: '只打印日志，不操作真实车辆，用于验证距离→动作闭环',
      isAvailable: true,
      factory: () => new SimulatedVehicleControl(),
    },
    {
      id: 'tesla',
      name: 'Tesla Fleet API（骨架）',
      description: '官方远程控制 API，需配置 Access Token 与 Vehicle ID',
      isAvailable: hasTeslaCredential,
      factory: () => new TeslaVehicleControl(),
    },
    {
      id: 'noop',
      name: '禁用（Noop）',
      description: '关闭所有车辆动作，仅保留测距展示',
      isAvailable: true,
      factory: () => new NoopVehicleControl(),
    },
  ];
}

/** 按 ID 快速创建执行器（用于引擎切换） */
export function createVehicleControl(id: string): VehicleControl {
  for (const entry of listVehicleControls(true)) {
    if (entry.id === id) return entry.factory();
  }
  return new SimulatedVehicleControl();
}
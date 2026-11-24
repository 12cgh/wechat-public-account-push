/**
 * 车辆控制抽象层（可插拔接口）
 *
 * 设计目标：自动动作引擎只依赖 VehicleControl 接口，
 * 上层可无侵入地替换/组合不同车厂的执行器：
 *
 *   - SimulatedVehicleControl：本地模拟实现，仅打印日志并广播事件，
 *     用于演示「距离 → 动作」闭环，无需真实车辆。
 *   - TeslaVehicleControl：新能源车官方远程控制 API 骨架。
 *     预留令牌/车辆 ID 注入点与调用注释，填入凭据后即可接入真实解锁/锁车。
 *
 * 接入新车型 = 新建一个实现 VehicleControl 的类，并在
 * services/ble/vehicleControlRegistry.ts 中注册。
 */

import type { VehicleActionType } from './types';

export interface VehicleActionResult {
  action: VehicleActionType;
  ok: boolean;
  message: string;
  /** 动作开始执行的时间戳（ms） */
  executedAt: number;
}

/** 车辆控制接口（协议） */
export interface VehicleControl {
  /** 实现唯一标识，用于日志/设置归档 */
  readonly id: string;
  /** 展示名称 */
  readonly name: string;
  /** 是否已配置可用（模拟实现恒为 true） */
  isAvailable(): boolean;
  /** 执行锁车 */
  lock(reason?: string): Promise<VehicleActionResult>;
  /** 执行解锁 */
  unlock(reason?: string): Promise<VehicleActionResult>;
  /** 订阅动作事件（模拟实现用于演示日志，真实实现可用于推送），返回退订函数 */
  onChange?(listener: (result: VehicleActionResult) => void): () => void;
}

type Listener = (result: VehicleActionResult) => void;

function makeResult(action: VehicleActionType, ok: boolean, message: string): VehicleActionResult {
  return { action, ok, message, executedAt: Date.now() };
}

/**
 * 模拟车辆控制实现：只在日志/事件中记录动作，不真正操作车辆。
 * 默认用于演示完整「距离感知 → 自动解锁/锁车」闭环。
 */
export class SimulatedVehicleControl implements VehicleControl {
  readonly id = 'simulated';
  readonly name = 'Simulated Vehicle（模拟执行器）';

  private listeners = new Set<Listener>();
  /** 最近一次动作结果（便于 UI 展示） */
  lastResult: VehicleActionResult | null = null;

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isAvailable(): boolean {
    return true;
  }

  async lock(reason = 'manual'): Promise<VehicleActionResult> {
    const result = makeResult('lock', true, `[Simulated] 车辆已上锁（${reason}）`);
    this.emit(result);
    return result;
  }

  async unlock(reason = 'manual'): Promise<VehicleActionResult> {
    const result = makeResult('unlock', true, `[Simulated] 车辆已解锁（${reason}）`);
    this.emit(result);
    return result;
  }

  private emit(result: VehicleActionResult): void {
    this.lastResult = result;
    this.listeners.forEach((l) => l(result));
  }
}

/** Tesla Fleet API 凭据结构（官方远程控制接口使用） */
export interface TeslaFleetApiCredential {
  /** 官方 OAuth access token（在 Tesla 开发者平台申请应用后获得） */
  accessToken: string;
  /** 目标车辆 ID（Fleet API 中的 vehicle id） */
  vehicleId: string;
  /** API 域名，默认使用官方地址；中国区/代理环境可覆盖 */
  apiBaseUrl?: string;
}

/**
 * 新能源车（特斯拉）远程控制实现 —— 骨架/预留类。
 *
 * ⚠️ 接入步骤（详见项目根目录 README「如何接入真实新能源车 API」）：
 * 1. 在特斯拉开发者平台创建应用，获取 Client ID/Secret，完成 OAuth，拿到 accessToken；
 * 2. 从 Fleet API 获取车辆列表，记录目标 vehicleId；
 * 3. 构造凭据并注入：setCredential({ accessToken, vehicleId })；
 * 4. 在 lock()/unlock() 的 TODO 处实现官方接口调用（命令结构见方法内注释）；
 * 5. 在 vehicleControlRegistry.ts 中把默认执行器切换为 Tesla。
 */
export class TeslaVehicleControl implements VehicleControl {
  readonly id = 'tesla';
  readonly name = 'Tesla Fleet API（骨架，待配置凭据）';

  private credential: TeslaFleetApiCredential | null = null;

  constructor(credential?: TeslaFleetApiCredential) {
    this.credential = credential ?? null;
  }

  setCredential(credential: TeslaFleetApiCredential | null): void {
    this.credential = credential;
  }

  getCredential(): TeslaFleetApiCredential | null {
    return this.credential;
  }

  isAvailable(): boolean {
    return !!this.credential?.accessToken && !!this.credential?.vehicleId;
  }

  async lock(reason = 'auto'): Promise<VehicleActionResult> {
    return this.exec('lock', reason);
  }

  async unlock(reason = 'auto'): Promise<VehicleActionResult> {
    return this.exec('unlock', reason);
  }

  private async exec(action: VehicleActionType, reason: string): Promise<VehicleActionResult> {
    if (!this.isAvailable() || !this.credential) {
      return makeResult(action, false, `Tesla 执行器未配置凭据（需要 accessToken + vehicleId），本次「${action}」未执行`);
    }
    const { accessToken, vehicleId, apiBaseUrl = 'https://fleet-api.prd.na.vn.cloud.tesla.com' } = this.credential;
    try {
      // 接入说明（填入真实凭据后按此实现官方命令调用）——
      // 1) 官方接口（POST）：
      //    URL:   ${apiBaseUrl}/api/1/vehicles/${vehicleId}/command/${action === 'lock' ? 'door_lock' : 'door_unlock'}
      //    Header: Authorization: Bearer ${accessToken}
      //    Body:   {}
      // 2) 响应：
      //    { response: { result: true, reason: '' } }
      // 3) result===true 视为成功；否则把 reason 带入 message。
      // 4) 若需轮询车辆状态（如 30s 超时），可调用 GET /api/1/vehicles/${vehicleId}/vehicle_data 校验 door_lock 状态。
      // 5) 注意 Tesla 命令有频率限制与 30s 冷却（每次命令间隔），并发命令需要排队。

      const response = await this.callTeslaCommand(apiBaseUrl, vehicleId, accessToken, action);
      if (response?.result === true) {
        return makeResult(action, true, `[Tesla] ${action === 'lock' ? '已上锁' : '已解锁'}（${reason}）`);
      }
      return makeResult(action, false, `[Tesla] 命令失败：${response?.reason || '未知错误'}`);
    } catch (e) {
      return makeResult(action, false, `[Tesla] 命令异常：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 官方命令调用占位实现。
   * 骨架阶段仅抛出「未接入」提示；填入真实凭据后按方法内注释改为真实 fetch 即可。
   */
  private async callTeslaCommand(
    apiBaseUrl: string,
    vehicleId: string,
    accessToken: string,
    action: VehicleActionType
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ result?: boolean; reason?: string } | null> {
    const _ = { apiBaseUrl, vehicleId, accessToken, action };
    // const resp = await fetch(`${_.apiBaseUrl}/api/1/vehicles/${_.vehicleId}/command/${...}`, {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${_.accessToken}`, 'Content-Type': 'application/json' },
    //   body: '{}',
    // });
    // const json = await resp.json();
    // return json?.response ?? null;
    throw new Error('TeslaVehicleControl 尚未接入官方 API，请在 callTeslaCommand 中填入真实请求代码');
  }
}

/** 空实现：什么都没有的控制器（用于关闭自动动作时的占位） */
export class NoopVehicleControl implements VehicleControl {
  readonly id = 'noop';
  readonly name = '已禁用（关闭自动动作）';
  isAvailable(): boolean {
    return true;
  }
  async lock(): Promise<VehicleActionResult> {
    return makeResult('lock', true, 'Noop（未执行任何操作）');
  }
  async unlock(): Promise<VehicleActionResult> {
    return makeResult('unlock', true, 'Noop（未执行任何操作）');
  }
}
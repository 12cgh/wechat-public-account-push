# 蓝牙车钥匙（BLE Car Key）

> 手机通过 **BLE 蓝牙信标测距** 自动完成车辆 **解锁 / 锁车** 的移动应用框架（Expo 54 + React Native + Express.js）。

App 作为 BLE **中心设备（Central）**持续扫描车端放置的低功耗蓝牙信标（ESP32 / iBeacon 模块），读取广播 **RSSI** 并换算为估算距离（米）。当距离小于**解锁阈值**（默认 2 m）时自动调用 `VehicleControl.unlock()`，当距离大于**锁车阈值**（默认 10 m）时自动调用 `VehicleControl.lock()`，真正对接车辆的动作通过**可插拔的 VehicleControl 接口**解耦 —— 当前内置模拟实现与 Tesla 官方 API 骨架，后续填凭据即可接入。

---

## 1. 功能清单

| 模块 | 说明 |
| --- | --- |
| BLE 测距 | 中心模式扫描 iBeacon / 普通 BLE 广播，读取 RSSI，换算距离（path-loss 模型） |
| RSSI 滤波 | **中值滤波 + 滑动平均 + 指数平滑（EMA）** 三段组合，剔除离群跳变 |
| 距离校准 | 可配置 `txPower / 环境衰减因子 n / 手机射频补偿 offset`，内置**两点采样校准向导** |
| 距离展示 | 主页环形距离仪表盘 + RSSI / 信号质量 / 连接状态 / 远中近三区可视化 |
| 自动动作 | `VehicleControl` 抽象接口（`lock()/unlock()`），阈值 + **防抖** 状态机自动触发，防抖避免阈值附近反复触发 |
| 车辆控制实现 | `SimulatedVehicleControl`（模拟，记录日志）+ `TeslaVehicleControl`（官方 API 骨架）+ `VehicleControlRegistry` 可插拔注册 |
| 设置页 | 解锁/锁车阈值、扫描间隔、防抖时间、信标 UUID/MAC 过滤、白名单手机、执行器切换、模拟模式 |
| 通知 | 动作触发时发系统通知（expo-notifications），主页展示最近动作日志 |
| 安全与省电 | 低功耗扫描模式 / 过滤重复广播、Android 12+ 邻近权限、iOS 定位权限提示、后台模式配置（后台限流见 README） |
| 单元测试 | RSSI 滤波、距离估算、校准、iBeacon 解析、自动动作引擎，共 36 个用例 |

---

## 2. 架构与数据流

```
BLE Beacon (ESP32/iBeacon)                        App (Central)
┌──────────────────────┐  广播 RSSI/txPower   ┌───────────────────────────────┐
│  -59 dBm @ 1m        │ ◄─────────────────── │  BeaconScanner(BLE/模拟)      │
│  广播周期 100~300ms  │                      │   ├─ RssiFilter(中值+滑动+EMA)│
└──────────────────────┘                      │   ├─ DistanceEstimator(校准)  │
                                              │   └─ iBeaconParser(UUID解析)  │
                                              │        │ DistanceReading       │
                                              │        ▼                       │
                                              │  AutoActionEngine(阈值+防抖)  │
                                              │        │                      │
                                              │        ▼                      │
                                              │  VehicleControl(可插拔)        │
                                              │   ├─ SimulatedVehicleControl  │
                                              │   └─ TeslaVehicleControl(骨架)│
                                              └───────────────────────────────┘
```

- `BeaconScanner`（真实 BLE / 模拟器）→ 原始广播
- `RssiFilter` → 平滑 RSSI
- `DistanceEstimator`（含 `CalibrationProfile`）→ 估算距离
- `AutoActionEngine` → 防抖决策，调用 `VehicleControl`
- `CarKeyContext`（全局 Provider）→ 编排扫描、估算、决策、通知、日志、设置持久化

---

## 3. 目录结构（关键部分）

```
client/
├── app/
│   ├── _layout.tsx              # 根布局（Stack + Tabs + Provider）
│   └── (tabs)/
│       ├── _layout.tsx          # 底部 Tab（主页 / 设置）
│       ├── index.tsx            # → screens/home
│       └── settings.tsx         # → screens/settings
├── screens/
│   ├── home/index.tsx           # 主页：距离仪表盘 + 状态 + 动作日志 + 手动锁/解
│   └── settings/index.tsx       # 设置页：阈值/滤波/信标过滤/白名单/校准/执行器
├── services/
│   ├── ble/
│   │   ├── types.ts             # 核心类型定义
│   │   ├── rssiFilter.ts        # 滤波（可单测）
│   │   ├── distanceEstimator.ts # 距离换算（可单测）
│   │   ├── distanceCalibrator.ts# 两点/多点校准（可单测）
│   │   ├── iBeaconParser.ts     # iBeacon 广播解析（可单测）
│   │   ├── autoActionEngine.ts  # 自动动作状态机（可单测）
│   │   ├── vehicleControl.ts    # VehicleControl 接口 + 模拟 + Tesla 骨架
│   │   ├── vehicleControlRegistry.ts
│   │   ├── beaconScanner.ts     # 真实 BLE 扫描（react-native-ble-plx）
│   │   ├── simulatedBeaconScanner.ts # 模拟信标（近/中/远轨迹，无硬件演示）
│   │   └── scannerFactory.ts    # 扫描器工厂（自动选择真实/模拟）
│   ├── settingsStore.ts         # 设置持久化（AsyncStorage）
│   ├── deviceIdentity.ts        # 设备 ID（expo-crypto + AsyncStorage）
│   └── notificationService.ts   # 系统通知
├── contexts/CarKeyContext.tsx   # 全局状态编排
├── components/DistanceRing.tsx  # 环形距离仪表盘（react-native-svg）
├── __tests__/                   # 36 个单元测试
server/src/index.ts              # Express 健康检查（/api/v1/health）
```

---

## 4. 快速开始

### 环境要求

- Node.js 24+
- pnpm 9+
- 真机调试需要：iOS 13+ / Android 8.0+（BLE 4.0+）

### 安装与启动

```bash
pnpm install          # 安装 monorepo 全部依赖
coze dev              # 启动 Expo Web(5000) 与 Express(9091)
```

### 让 BLE 在真机上跑起来

> **重要**：BLE 原生模块（`react-native-ble-plx`）**不能在 Expo Go 中运行**，必须使用 **Development Build**：

```bash
cd client
npx expo run:ios      # 或
npx expo run:android  # 或通过 EAS: npx eas build --profile development --platform android
```

启动后 App 默认运行在**模拟信标模式**（无需硬件即可体验完整流程）；在「设置 → 信标过滤 → 模拟模式」关闭后即切换为真实 BLE 扫描。

---

## 5. 车端信标怎么配

任何持续广播的 BLE 外设都可作为车端信标，推荐使用 iBeacon 协议（携带 UUID + txPower）。

| 参数 | 建议值 | 说明 |
| --- | --- | --- |
| 广播协议 | iBeacon | 自带 UUID/Major/Minor/Tx-Power，App 可解析 |
| `1 米处 RSSI`(txPower) | -59 dBm | 标定环境不同会有差异，可在 App 校准 |
| 广播频率 | 100~300 ms | 越高响应越快、越耗电 |
| 广播功率 | 0 dBm (Android) / 定制 | 覆盖半径约 30~50 m |

### 5.1 ESP32 示例（Arduino / ESP-IDF）

以 ESP32 + `ESP32 BLE Arduino` 库配置 iBeacon：

```cpp
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEBeacon.h>

#define BEACON_UUID "4c61724b-6579-4b65-7900-000000000001" // 建议与 App 设置一致
#define BEACON_MAJOR   1
#define BEACON_MINOR   1
#define BEACON_TXPOWER (-59)   // 1m 处 RSSI 参考值

void setup() {
  BLEDevice::init("CarKeyBeacon");
  BLEServer *server = BLEDevice::createServer();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();

  BLEBeacon beacon;
  beacon.setManufacturerId(0x004C);                 // Apple Company ID (0x004C)
  beacon.setProximityUUID(BLEUUID(BEACON_UUID));
  beacon.setMajor(BEACON_MAJOR);
  beacon.setMinor(BEACON_MINOR);
  beacon.setMeasuredPower(BEACON_TXPOWER);

  BLEAdvertisementData advertisementData;
  advertisementData.setFlags(0x06);
  advertisementData.setManufacturerData(beacon.getData());
  advertising->setAdvertisementData(advertisementData);
  // 广播周期 100ms
  advertising->setMinInterval(100);
  advertising->setMaxInterval(100);
  advertising->start();
}

void loop() { delay(1000); }
```

### 5.2 现成 iBeacon 模块

- 购买任意 **iBeacon 节点/门牌信标**（如 Nordic nRF52832、传感器标签、蓝牙工牌）。
- 用厂商工具（nRF Connect / BeaconSet / 微信小程序「iBeacon 配置」）写入：
  - 与 App 设置页相同的 `UUID`（App 默认 `4c61724b-6579-4b65-7900-000000000001`）
  - 广播间隔 100~300 ms、功率 0 dBm。
- 将信标固定在**驾驶位车门内侧 / 后备箱**位置，注意避开金属整体屏蔽。

### 5.3 App 内过滤

- 设置页「信标 UUID」：填写 iBeacon UUID；留空表示不过滤（对普通 BLE 广播可只按 MAC）。
- 设置页「信标 MAC」：填写设备地址（如 `CC:DB:A7:...`，大小写不敏感），支持子串匹配。
- 真实扫描器会自动解析 iBeacon 广播；非 iBeacon 广播则使用 `txPowerLevel / 默认 -59` 参与估算。

---

## 6. 距离校准步骤

### 6.1 原理

蓝牙 RSSI 与距离近似符合 **路径损耗模型**：

```
RSSI = txPower - 10 · n · log10(d)     ⇒     d = 10^((txPower + offset - RSSI) / (10 · n))
```

- `txPower`：1 米处的参考 RSSI（信标广播自带或默认 -59）
- `n`：环境衰减因子（开阔空间 ≈ 2.0，室内带遮挡 ≈ 2.5~3.0）
- `offset`：**手机射频差异补偿**（不同手机 RF 灵敏度不同，通常 -5 ~ +5 dBm）

### 6.2 App 内操作步骤

1. 真机连好信标，进入「设置 → 距离校准」。
2. 手拿手机**正对信标、与胸腔同高**，站在 **1 米** 处静止 5 秒：
   - 点击「采样 @1 米」记录当前位置滤波 RSSI。
3. 走到 **3~5 米** 处静止 5 秒：
   - 点击「采样 @该距离」再记一个点。
4. 点击「用采样计算校准」：`calibrateFromSamples()` 会做线性回归得到 `txPower` 与 `n`。
5. 若在多台手机上执行相同步骤得到不同 `txPower`，其差值即该机的 `offset`，可手动微调。
6. 保存后回到主页，观察估算距离是否贴近实际；不准确则微调 `txPower / n`。

> 校准样本应取**滤波后** RSSI 的平均值，并剔除电梯、金属门等瞬时干扰（滤波模块已内置中值剔除）。

---

## 7. 如何接入真实新能源车 API

### 7.1 抽象接口（已实现）

```ts
// services/ble/vehicleControl.ts
export interface VehicleControl {
  readonly name: string;
  lock(): Promise<VehicleActionResult>;
  unlock(): Promise<VehicleActionResult>;
}
```

`VehicleControlRegistry` 负责按 ID 创建实现，引擎在触发动作时通过它获取执行器，因此**接入新车厂只需新增一个实现类并在 Registry 注册**。

已内置：

| ID | 实现 | 说明 |
| --- | --- | --- |
| `simulated` | `SimulatedVehicleControl` | 仅记录/打印日志，方便演示与联调 |
| `tesla` | `TeslaVehicleControl` | 官方 Fleet API 骨架（见下），填凭据即可 |
| `noop` | `NoopVehicleControl` | 无操作，便于纯测距调试 |

### 7.2 接入 Tesla（Fleet API）骨架说明

`TeslaVehicleControl` 已在 `services/ble/vehicleControl.ts` 内预留完整骨架：

```ts
new TeslaVehicleControl({
  accessToken: '<填入 OAuth2 access_token>',
  vehicleId: '<填入车辆 ID>',
  apiBaseUrl: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
})
```

接入步骤（以 Tesla 为例，其他车厂同理）：

1. **开通开发者账号**：到 Tesla Developer Portal 创建 Client App，获得 `client_id / client_secret`。
2. **获取授权**：引导车主完成 OAuth2（`vehicle:vehicle_controls` 等 scope），使用车主账户换取 `access_token`。
3. **查找车辆 ID**：调用 `GET /api/1/vehicles` 获取 `id_s`（或从手机 App 抓包）。
4. **把凭据注入 `TeslaVehicleControl`**：在 `VehicleRegistry` 的 `createVehicleControl('tesla', ctx)` 分支中传入 accessToken / vehicleId（生产环境建议从服务端安全下发，不要硬编码进包）。
5. **调用控制接口**：骨架中已实现

   - `POST /api/1/vehicles/{id}/command/door_unlock`
   - `POST /api/1/vehicles/{id}/command/door_lock`

   返回 `{ "response": { "result": true } }` 即成功。

> 骨架中预留了 `postCommand()` 示例与错误处理注释。**注意**：真实车厂 API 均有调用频率限制与安全审计（车控属于高风险操作），务必做好防抖、本地鉴权（白名单）与服务端鉴权，避免恶意调用。其他车厂（如比亚迪、蔚来、小鹏）大多提供同类的远程控制 HTTP API，按相同模式实现 `VehicleControl` 即可。

### 7.3 在设置页切换执行器

「设置 → 车辆执行器」可选：

- `simulated`（默认，模拟执行并记录日志）
- `noop`（无操作）
- `tesla`（需先在代码中配置凭据才会出现在列表；仅骨架时显示"未配置"提示）

---

## 8. 权限与后台扫描说明

| 平台 | 所需权限 | 处理方式 |
| --- | --- | --- |
| iOS | `NSBluetoothAlwaysUsageDescription`、`NSLocationWhenInUseUsageDescription` | 由 `react-native-ble-plx` / `expo-location` 插件自动写入；首次扫描前弹出申请 |
| Android 8~11 | `ACCESS_FINE_LOCATION`（BLE 扫描要求） | 启动扫描时申请（`expo-location`） |
| Android 12+ | `BLUETOOTH_SCAN`、`BLUETOOTH_CONNECT`（邻近权限） | 启动扫描时申请（`PermissionsAndroid`，`neverForLocation=true` 时无需定位权限） |

后台持续扫描：

- **iOS**：已开启 `UIBackgroundModes: [bluetooth-central]`，系统允许后台 BLE 扫描但不保证回调频率。
- **Android 12+**：后台扫描受限，系统会对高频扫描限流（“3 分钟窗口限制”）。本项目已配置 `isBackgroundEnabled`（前台服务支持）与低功耗扫描参数；生产环境若需长时间后台解锁，建议增加**前台服务通知常驻**，或采用「低频探活 + 走近时系统级 Bluetooth 唤起」方案。
- 本项目在主界面提供**扫描总开关**，不使用时请关闭以省电。

---

## 9. 单元测试

测距核心全部为纯 TypeScript 模块，可脱离 React Native 运行：

```bash
cd client && npx jest --runInBand
```

覆盖：RSSI 滤波（去离群/收敛）、距离估算（公式/边界）、两点采样校准、iBeacon 广播解析、自动动作引擎（阈值触发/防抖/滞回/手动优先）。

---

## 10. 设计与主题

- 使用**暗黑科技风**（纯黑底 `#0A0A0F` + 电光青 `#00F0FF` + 霓虹紫 `#BF00FF`），详见 `DESIGN.md`。
- 固定暗色主题：`client/components/ColorSchemeUpdater.tsx` 的 `DEFAULT_THEME = 'dark'`。
- 设计令牌：`client/global.css`（Uniwind / Tailwind 体系）。

---

## 11. 常见问题

- **Expo Go 打不开 / 白屏？** BLE 需要原生模块，请用 `npx expo run:ios|android` / EAS Dev Build。
- **真机扫不到信标？** 确认手机蓝牙打开、信标在广播（用 nRF Connect 可见）、App 内 UUID/MAC 过滤未写错。
- **估算距离波动大？** 增大「扫描间隔」与滤波窗口；重新完成 6.2 校准；远离金属与人体遮挡。
- **反复解锁/锁车？** 增大「防抖时间」，并确保解锁/锁车阈值间隔足够（如 2 m / 8 m）。

---

## 12. 其他

- 前端：Expo 54 + React Native + Expo Router
- 后端：Express `server/src/index.ts`（健康检查 `GET /api/v1/health`，端口 9091；当前为纯本地 BLE 应用，无业务后端依赖）
- 静态检查：`pnpm -w lint:all`
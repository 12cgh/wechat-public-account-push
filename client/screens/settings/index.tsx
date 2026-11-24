/**
 * 设置页 —— 距离阈值 / 扫描行为 / 信标过滤 / 距离校准 / 白名单 / 执行器
 * 暗黑科技风
 */
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { useCarKey } from '@/contexts/CarKeyContext';
import { calibrateFromSamples, type CalibrationSample } from '@/services/ble/distanceCalibrator';
import type { CalibrationProfile } from '@/services/ble/types';

export default function SettingsScreen() {
  const { settings, updateSettings, deviceId, lastReading, resetSession } = useCarKey();

  const [manualTx, setManualTx] = useState(() => String(settings.calibration.txPower));
  const [manualN, setManualN] = useState(() => String(settings.calibration.environmentFactor));
  const [manualOffset, setManualOffset] = useState(() => String(settings.calibration.calibratedOffset));
  const [samples, setSamples] = useState<CalibrationSample[]>([]);
  const [calMessage, setCalMessage] = useState('');

  const addSample = () => {
    if (lastReading === null) {
      setCalMessage('请先在主页开启扫描，等有距离读数后再采样');
      return;
    }
    if (samples.length >= 2) {
      setCalMessage('已收集两个样本（1m / 5m 各一个），点击下方「计算校准参数」');
      return;
    }
    const distanceMeters = samples.length === 0 ? 1 : 5;
    setSamples((prev) => [...prev, { distanceMeters, rssi: lastReading.rawRssi }]);
    setCalMessage(`已采样：${distanceMeters} m 处 RSSI = ${lastReading.rawRssi.toFixed(1)} dBm（请移动至 ${distanceMeters === 1 ? '5' : '1'} m 处再采一次）`);
  };

  const applyCalibration = () => {
    if (samples.length >= 2) {
      const result = calibrateFromSamples(samples);
      if (result.ok && result.profile) {
        void updateSettings({ calibration: result.profile });
        setManualTx(String(result.profile.txPower));
        setManualN(String(result.profile.environmentFactor));
        setManualOffset(String(result.profile.calibratedOffset));
        setCalMessage(`校准完成：txPower=${result.profile.txPower.toFixed(1)}，环境指数 n=${result.profile.environmentFactor.toFixed(2)}`);
        return;
      }
      setCalMessage(result.message);
      return;
    }
    setCalMessage('先采集至少两个不同距离的样本（如 1m、5m）再计算');
  };

  const applyManualCalibration = () => {
    const tx = Number.parseFloat(manualTx);
    const n = Number.parseFloat(manualN);
    const off = Number.parseFloat(manualOffset) || 0;
    if (!Number.isFinite(tx) || !Number.isFinite(n) || n <= 0.5 || n > 6) {
      setCalMessage('txPower 需为数字；环境指数 n 应在 0.5~6 之间');
      return;
    }
    const profile: CalibrationProfile = { txPower: tx, environmentFactor: n, calibratedOffset: off };
    void updateSettings({ calibration: profile });
    setCalMessage(`已应用手动校准参数（txPower=${tx.toFixed(1)}，n=${n.toFixed(2)}，offset=${off >= 0 ? '+' : ''}${off.toFixed(1)}）`);
  };

  const addToWhitelist = () => {
    if (!deviceId) return;
    if (settings.whitelist.includes(deviceId)) return;
    void updateSettings({ whitelist: [...settings.whitelist, deviceId] });
  };

  const removeFromWhitelist = (id: string) => {
    void updateSettings({ whitelist: settings.whitelist.filter((v) => v !== id) });
  };

  const isCurrentInWhitelist = !!deviceId && settings.whitelist.includes(deviceId);

  return (
    <Screen>
      <View style={styles.root}>
        <View style={styles.topbar}>
          <Text style={styles.brand}>SETTINGS</Text>
          <Text style={styles.subtitle}>阈值 / 信标 / 校准 / 白名单</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* 距离阈值 */}
          <Section title="距离阈值" icon="ruler">
            <Row label="解锁阈值（米）" hint="距离小于该值自动解锁">
              <Stepper
                value={settings.unlockThresholdM}
                min={0.5}
                max={10}
                step={0.5}
                onChange={(v) => void updateSettings({ unlockThresholdM: v })}
              />
            </Row>
            <Row label="锁车阈值（米）" hint="距离大于该值自动锁车">
              <Stepper
                value={settings.lockThresholdM}
                min={5}
                max={40}
                step={1}
                onChange={(v) => void updateSettings({ lockThresholdM: v })}
              />
            </Row>
            <Row label="防抖时间（秒）" hint="避免阈值附近抖动反复触发">
              <Stepper
                value={Math.round(settings.debounceMs / 1000)}
                min={1}
                max={60}
                step={1}
                onChange={(v) => void updateSettings({ debounceMs: v * 1000 })}
              />
            </Row>
            <Row label="扫描间隔（秒）" hint="估值主环路刷新频率（越低越省电）">
              <Stepper
                value={settings.scanIntervalMs / 1000}
                min={0.3}
                max={10}
                step={0.1}
                onChange={(v) => void updateSettings({ scanIntervalMs: Math.round(v * 1000) })}
                precision={1}
              />
            </Row>
          </Section>

          {/* 行为与功耗 */}
          <Section title="行为与功耗" icon="bolt">
            <Row label="自动动作" hint="关闭后仅手动锁车/解锁">
              <Switch
                value={settings.autoActionsEnabled}
                onValueChange={(v) => void updateSettings({ autoActionsEnabled: v })}
                trackColor={{ false: '#20242F', true: '#00F0FF' }}
                thumbColor={settings.autoActionsEnabled ? '#05060A' : '#8B8CA3'}
              />
            </Row>
            <Row label="动作系统通知" hint="触发动作时发送系统通知">
              <Switch
                value={settings.enableNotifications}
                onValueChange={(v) => void updateSettings({ enableNotifications: v })}
                trackColor={{ false: '#20242F', true: '#00F0FF' }}
                thumbColor={settings.enableNotifications ? '#05060A' : '#8B8CA3'}
              />
            </Row>
            <Row label="低功耗扫描" hint="降低扫描占空比，减少耗电（iOS Ear 支持有限）">
              <Switch
                value={settings.lowPowerMode}
                onValueChange={(v) => void updateSettings({ lowPowerMode: v })}
                trackColor={{ false: '#20242F', true: '#FFB020' }}
                thumbColor={settings.lowPowerMode ? '#05060A' : '#8B8CA3'}
              />
            </Row>
            <Row label="模拟信标模式" hint="无硬件时演示完整距离→动作闭环">
              <Switch
                value={settings.simulationMode}
                onValueChange={(v) => void updateSettings({ simulationMode: v })}
                trackColor={{ false: '#20242F', true: '#BF6BFF' }}
                thumbColor={settings.simulationMode ? '#05060A' : '#8B8CA3'}
              />
            </Row>
          </Section>

          {/* 信标过滤 */}
          <Section title="信标过滤" icon="filter">
            <TextInput
              style={styles.input}
              placeholder="iBeacon UUID / Service UUID（留空不过滤）"
              placeholderTextColor="#5C5E73"
              value={settings.beaconUuid}
              onChangeText={(v) => void updateSettings({ beaconUuid: v.trim() })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              placeholder="信标 MAC / 设备 ID：支持子串匹配"
              placeholderTextColor="#5C5E73"
              value={settings.beaconMacFilter}
              onChangeText={(v) => void updateSettings({ beaconMacFilter: v.trim() })}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hintText}>修改过滤条件后需重新打开扫描开关生效。</Text>
          </Section>

          {/* 距离校准 */}
          <Section title="距离校准" icon="crosshairs">
            <View style={styles.calStatus}>
              <Text style={styles.calItemLabel}>当前样本 RSSI（滤波后）</Text>
              <Text style={styles.calItemValue}>{lastReading ? `${lastReading.rawRssi.toFixed(1)} dBm` : '--'}</Text>
            </View>

            <TouchableOpacity style={styles.primaryBtn} onPress={addSample}>
              <FontAwesome6 name="camera" size={14} color="#05060A" />
              <Text style={styles.primaryBtnText}>采样当前 RSSI（第 {samples.length + 1} 个点）</Text>
            </TouchableOpacity>
            <View style={styles.sampleRow}>
              {samples.map((s) => (
                <View key={s.distanceMeters} style={styles.sampleChip}>
                  <Text style={styles.sampleChipText}>{s.distanceMeters} m · {s.rssi.toFixed(0)} dBm</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.secondaryBtn} onPress={applyCalibration}>
              <FontAwesome6 name="wand-magic-sparkles" size={14} color="#00F0FF" />
              <Text style={styles.secondaryBtnText}>计算校准参数（两点线性回归）</Text>
            </TouchableOpacity>

            <View style={styles.calDivider} />

            <Text style={styles.calItemLabel}>手动校准参数</Text>
            <View style={styles.manualRow}>
              <NumField label="txPower" value={manualTx} onChangeText={setManualTx} placeholder="-59" />
              <NumField label="环境指数 n" value={manualN} onChangeText={setManualN} placeholder="2.0" />
              <NumField label="补偿 offset" value={manualOffset} onChangeText={setManualOffset} placeholder="0" />
            </View>
            <TouchableOpacity style={styles.secondaryBtn} onPress={applyManualCalibration}>
              <FontAwesome6 name="check" size={14} color="#00F0FF" />
              <Text style={styles.secondaryBtnText}>应用手动校准参数</Text>
            </TouchableOpacity>

            {calMessage ? <Text style={styles.calMessage}>{calMessage}</Text> : null}
            <Text style={styles.hintText}>
              校准原理：RSSI = txPower − 10·n·log₁₀(d)，在 1 m 与 5 m 两处采样可反解 txPower 与 n；offset 用于补偿不同手机的射频差异。
            </Text>
          </Section>

          {/* 白名单 */}
          <Section title="白名单手机" icon="user-shield">
            <Row label="启用白名单" hint="仅白名单内的设备可触发动作">
              <Switch
                value={settings.whitelistEnabled}
                onValueChange={(v) => void updateSettings({ whitelistEnabled: v })}
                trackColor={{ false: '#20242F', true: '#00F0FF' }}
                thumbColor={settings.whitelistEnabled ? '#05060A' : '#8B8CA3'}
              />
            </Row>
            <Row label="本机设备 ID" hint="标识本机，可加入车队白名单">
              <Text style={styles.deviceId} numberOfLines={1}>{deviceId ?? '--'}</Text>
            </Row>
            <View style={styles.miniRow}>
              <TouchableOpacity
                style={[styles.miniBtn, isCurrentInWhitelist && { opacity: 0.4 }]}
                disabled={isCurrentInWhitelist}
                onPress={addToWhitelist}
              >
                <FontAwesome6 name="plus" size={12} color="#00F0FF" />
                <Text style={styles.miniBtnText}>{isCurrentInWhitelist ? '已在白名单' : '添加本机'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniBtnDanger, { opacity: isCurrentInWhitelist ? 1 : 0.4 }]}
                disabled={!isCurrentInWhitelist}
                onPress={() => deviceId && removeFromWhitelist(deviceId)}
              >
                <FontAwesome6 name="minus" size={12} color="#FF3B8D" />
                <Text style={styles.miniBtnDangerText}>移除本机</Text>
              </TouchableOpacity>
            </View>
            {settings.whitelist.length > 0 ? (
              settings.whitelist.map((id) => (
                <View key={id} style={styles.wlRow}>
                  <Text style={styles.wlId} numberOfLines={1}>{id}</Text>
                  <TouchableOpacity onPress={() => removeFromWhitelist(id)} hitSlop={10}>
                    <FontAwesome6 name="trash" size={13} color="#8B8CA3" />
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <Text style={styles.hintText}>白名单为空：连接任一手机后点击「添加本机」。</Text>
            )}
          </Section>

          {/* 车辆执行器 */}
          <Section title="车辆执行器" icon="car-side">
            {(['simulated', 'tesla', 'noop'] as const).map((impl) => (
              <TouchableOpacity
                key={impl}
                style={[styles.implRow, settings.vehicleImpl === impl && styles.implRowActive]}
                onPress={() => void updateSettings({ vehicleImpl: impl })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.implName}>
                    {impl === 'simulated' ? '模拟执行器（演示）' : impl === 'tesla' ? 'Tesla Fleet API（骨架）' : '已禁用'}
                  </Text>
                  <Text style={styles.implDesc}>
                    {impl === 'simulated'
                      ? '仅在日志中记录动作，无需真实车辆'
                      : impl === 'tesla'
                        ? '预留官方远程控制接口，需配置凭据（见 README）'
                        : '关闭对所有车辆的动作'}
                  </Text>
                </View>
                <FontAwesome6 name="chevron-right" size={12} color="#8B8CA3" />
              </TouchableOpacity>
            ))}
          </Section>

          {/* 权限说明 */}
          <Section title="权限说明" icon="shield-halved">
            <Text style={styles.permissionText}>
              · Android 12+ 需要「附近的设备」（BLUETOOTH_SCAN/BLUETOOTH_CONNECT）；Android 6~11 需要定位权限。{'\n'}
              · iOS 需要「蓝牙」（NSBluetoothAlwaysUsageDescription）与「定位」权限（BLE 中心扫描依赖）。{'\n'}
              · 后台扫描：iOS 通过 UIBackgroundModes=bluetooth-central 支持；Android 12+ 后台持续扫描受系统限流，建议锁定时保持前台或使用前台服务（详见 README）。{'\n'}
              · 模拟模式下不申请任何真实权限。
            </Text>
            <TouchableOpacity style={styles.resetBtn} onPress={() => void resetSession()}>
              <FontAwesome6 name="rotate-left" size={13} color="#FF3B8D" />
              <Text style={styles.resetBtnText}>重置本次会话（清空日志与缓存）</Text>
            </TouchableOpacity>
          </Section>
        </ScrollView>
      </View>
    </Screen>
  );
}

/* ---------- 小组件 ---------- */

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <FontAwesome6 name={icon as never} size={13} color="#00F0FF" />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Stepper({
  value,
  min,
  max,
  step,
  precision = 0,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
  onChange: (v: number) => void;
}) {
  const dec = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(dec(value - step))} hitSlop={6}>
        <FontAwesome6 name="minus" size={12} color="#8B8CA3" />
      </TouchableOpacity>
      <Text style={styles.stepperValue} numberOfLines={1}>
        {value.toFixed(precision)}
      </Text>
      <TouchableOpacity style={styles.stepperBtn} onPress={() => onChange(dec(value + step))} hitSlop={6}>
        <FontAwesome6 name="plus" size={12} color="#00F0FF" />
      </TouchableOpacity>
    </View>
  );
}

function NumField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.numField}>
      <Text style={styles.numLabel}>{label}</Text>
      <TextInput
        style={styles.numInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor="#5C5E73"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060A' },
  topbar: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  brand: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: 1.5 },
  subtitle: { color: '#8B8CA3', fontSize: 11, marginTop: 2, letterSpacing: 1 },
  scroll: { paddingHorizontal: 14, paddingBottom: 40, gap: 12 },
  section: {
    backgroundColor: '#0C0D14',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1C2030',
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#0A0B11',
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  sectionBody: { padding: 16, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingVertical: 8 },
  rowLabel: { color: '#E8E9F2', fontSize: 14, fontWeight: '600' },
  rowHint: { color: '#8B8CA3', fontSize: 11, marginTop: 2 },
  input: {
    backgroundColor: '#13141D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22263A',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
  },
  hintText: { color: '#5C5E73', fontSize: 11, marginTop: 10, lineHeight: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#13141D', borderRadius: 12, borderWidth: 1, borderColor: '#22263A', overflow: 'hidden' },
  stepperBtn: { width: 36, height: 38, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 64, textAlign: 'center', color: '#FFFFFF', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  calStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#13141D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22263A',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  calItemLabel: { color: '#8B8CA3', fontSize: 12 },
  calItemValue: { color: '#00F0FF', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#00F0FF',
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#05060A', fontSize: 14, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    backgroundColor: '#0E1B22',
    borderWidth: 1,
    borderColor: '#00F0FF45',
    borderRadius: 12,
    paddingVertical: 11,
  },
  secondaryBtnText: { color: '#00F0FF', fontSize: 13, fontWeight: '700' },
  sampleRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  sampleChip: { backgroundColor: '#171A29', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  sampleChipText: { color: '#BF6BFF', fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  calDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#22263A', marginVertical: 14 },
  manualRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  numField: { flex: 1 },
  numLabel: { color: '#8B8CA3', fontSize: 11, marginBottom: 4 },
  numInput: {
    backgroundColor: '#13141D',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#22263A',
    color: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  calMessage: { color: '#FFB020', fontSize: 12, marginTop: 10, lineHeight: 17 },
  deviceId: { color: '#BF6BFF', fontSize: 12, maxWidth: 170, fontVariant: ['tabular-nums'] },
  miniRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#00F0FF0D',
    borderWidth: 1,
    borderColor: '#00F0FF45',
  },
  miniBtnText: { color: '#00F0FF', fontSize: 12, fontWeight: '600' },
  miniBtnDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FF3B8D0D',
    borderWidth: 1,
    borderColor: '#FF3B8D45',
  },
  miniBtnDangerText: { color: '#FF3B8D', fontSize: 12, fontWeight: '600' },
  wlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#13141D',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  },
  wlId: { color: '#E8E9F2', fontSize: 12, flex: 1, fontVariant: ['tabular-nums'] },
  implRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22263A',
    backgroundColor: '#13141D',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
  },
  implRowActive: { borderColor: '#00F0FF66', backgroundColor: '#00F0FF0A' },
  implName: { color: '#E8E9F2', fontSize: 14, fontWeight: '700' },
  implDesc: { color: '#8B8CA3', fontSize: 11, marginTop: 2 },
  permissionText: { color: '#8B8CA3', fontSize: 12, lineHeight: 20 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: '#FF3B8D0D',
    borderWidth: 1,
    borderColor: '#FF3B8D45',
    borderRadius: 12,
    paddingVertical: 11,
  },
  resetBtnText: { color: '#FF3B8D', fontSize: 13, fontWeight: '700' },
});
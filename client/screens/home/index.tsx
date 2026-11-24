/**
 * 主页 —— 实时距离感知 + 车辆状态 + 手动控制 + 动作日志
 * 暗黑科技风（纯黑底 + 霓虹青/紫）
 */
import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import DistanceRing, { distanceZone, zoneColor } from '@/components/DistanceRing';
import { useCarKey } from '@/contexts/CarKeyContext';
import type { CarKeyState, ScannerStatus } from '@/services/ble/types';

const CAR_STATE_LABEL: Record<CarKeyState, { text: string; hint: string }> = {
  unknown: { text: '状态未知', hint: '启动扫描以感知距离' },
  locked: { text: '已锁定', hint: '车辆门锁已关闭' },
  unlocking: { text: '解锁中…', hint: '正在执行解锁' },
  unlocked: { text: '已解锁', hint: '车辆门锁已开启' },
  locking: { text: '锁车中…', hint: '正在执行锁车' },
  error: { text: '执行异常', hint: '最近一次动作失败' },
};

const SCANNER_STATUS: Record<ScannerStatus, { text: string; color: string }> = {
  idle: { text: '待机', color: '#3A3A4A' },
  starting: { text: '启动中', color: '#FFB020' },
  scanning: { text: '扫描中', color: '#00F0FF' },
  stopping: { text: '停止中', color: '#FFB020' },
  unauthorized: { text: '无权限', color: '#FF3B8D' },
  error: { text: '错误', color: '#FF3B8D' },
  'bluetooth-off': { text: '蓝牙关闭', color: '#FF3B8D' },
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds()
  ).padStart(2, '0')}`;
}

export default function HomeScreen() {
  const {
    active,
    setActive,
    scannerStatus,
    lastBeacon,
    lastReading,
    settings,
    carState,
    actionLogs,
    manualLock,
    manualUnlock,
  } = useCarKey();

  const distance = lastReading?.distance ?? null;
  const zone = distanceZone(distance, settings.unlockThresholdM, settings.lockThresholdM);
  const color = zoneColor(zone);
  const conn = SCANNER_STATUS[scannerStatus] ?? SCANNER_STATUS.idle;
  const state = CAR_STATE_LABEL[carState];

  const logs = useMemo(() => actionLogs.slice(0, 8), [actionLogs]);

  return (
    <Screen>
      <View style={styles.root}>
        {/* 顶部标题栏 */}
        <View style={styles.topbar}>
          <View>
            <Text style={styles.brand}>BLE · CAR KEY</Text>
            <Text style={styles.subtitle}>蓝牙车钥匙 · 距离感知系统</Text>
          </View>
          <View style={styles.powerWrap}>
            <View style={[styles.statusDot, { backgroundColor: conn.color }]} />
            <Text style={styles.statusText}>{conn.text}</Text>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* 主仪表盘 */}
          <View style={styles.hero}>
            <DistanceRing
              distance={distance}
              unlockThreshold={settings.unlockThresholdM}
              lockThreshold={settings.lockThresholdM}
              zone={zone}
              size={272}
            />
            <View style={[styles.zoneBadge, { borderColor: `${color}55`, backgroundColor: `${color}14` }]}>
              <View style={[styles.zoneDot, { backgroundColor: color }]} />
              <Text style={[styles.zoneText, { color }]}>
                {zone === 'near' ? '已到达 · 解锁区域' : zone === 'middle' ? '接近中 · 中部区域' : zone === 'far' ? '远离 · 锁车区域' : '未感知到信标'}
              </Text>
            </View>
          </View>

          {/* 指标卡片 */}
          <View style={styles.metricRow}>
            <MetricCard label="信号强度" value={lastReading ? `${lastReading.rssi.toFixed(1)}` : '--'} unit="dBm" accent="#00F0FF" />
            <MetricCard label="信号质量" value={lastReading ? `${Math.round(lastReading.quality * 100)}` : '--'} unit="%" accent="#FFB020" />
            <MetricCard label="信标 ID" value={truncateId(lastBeacon?.id, 6)} unit="" accent="#BF6BFF" small />
          </View>

          {/* 车辆状态 */}
          <View style={[styles.stateCard, { borderColor: `${color}33` }]}>
            <View style={styles.stateRow}>
              <FontAwesome6 name={carState === 'unlocked' || carState === 'unlocking' ? 'lock-open' : 'lock'} size={22} color={color} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.stateTitle}>{state.text}</Text>
                <Text style={styles.stateHint}>{state.hint}</Text>
              </View>
              <Switch
                value={active}
                onValueChange={(v) => void setActive(v)}
                trackColor={{ false: '#20242F', true: '#00F0FF' }}
                thumbColor={active ? '#05060A' : '#8B8CA3'}
              />
            </View>
            {!settings.autoActionsEnabled && (
              <View style={styles.autoOff}>
                <FontAwesome6 name="triangle-exclamation" size={12} color="#FFB020" />
                <Text style={styles.autoOffText}>自动动作已关闭，仅可手动控制</Text>
              </View>
            )}
            {settings.whitelistEnabled && (
              <View style={styles.autoOff}>
                <FontAwesome6 name="user-shield" size={12} color="#00F0FF" />
                <Text style={styles.autoOffText}>白名单模式已开启</Text>
              </View>
            )}
          </View>

          {/* 手动控制按钮 */}
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlBtn, styles.lockBtn, { opacity: active ? 1 : 0.4 }]}
              onPress={() => void manualLock()}
            >
              <FontAwesome6 name="lock" size={20} color="#BF6BFF" />
              <Text style={[styles.controlText, { color: '#BF6BFF' }]}>手动锁车</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlBtn, styles.unlockBtn, { opacity: active ? 1 : 0.4 }]}
              onPress={() => void manualUnlock()}
            >
              <FontAwesome6 name="lock-open" size={20} color="#00F0FF" />
              <Text style={[styles.controlText, { color: '#00F0FF' }]}>手动解锁</Text>
            </TouchableOpacity>
          </View>

          {/* 最近动作日志 */}
          <View style={styles.logCard}>
            <View style={styles.logHeader}>
              <Text style={styles.logTitle}>最近动作</Text>
              <Text style={styles.logCount}>{actionLogs.length}</Text>
            </View>
            {logs.length === 0 ? (
              <View style={styles.emptyLog}>
                <Text style={styles.emptyLogText}>暂无动作记录，靠近/远离车辆将自动生成</Text>
              </View>
            ) : (
              logs.map((item) => (
                <View key={item.id} style={styles.logRow}>
                  <View style={[styles.logIcon, { backgroundColor: item.action === 'unlock' ? '#00F0FF18' : '#BF6BFF18' }]}>
                    <FontAwesome6
                      name={item.action === 'unlock' ? 'lock-open' : 'lock'}
                      size={12}
                      color={item.action === 'unlock' ? '#00F0FF' : '#BF6BFF'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logAction}>
                      {item.action === 'unlock' ? '解锁' : '锁车'} · {item.source === 'manual' ? '手动' : '自动'}
                      {item.ok ? '' : '（失败）'}
                    </Text>
                    <Text style={styles.logMeta}>
                      {item.distance !== null && item.distance !== undefined
                        ? `触发距离 ${item.distance.toFixed(2)} m · `
                        : ''}
                      {formatTime(item.timestamp)}
                    </Text>
                  </View>
                  <Text style={[styles.logOk, { color: item.ok ? '#00F0FF' : '#FF3B8D' }]}>
                    {item.ok ? '✓' : '✕'}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </Screen>
  );
}

function MetricCard({
  label,
  value,
  unit,
  accent,
  small,
}: {
  label: string;
  value: string;
  unit: string;
  accent: string;
  small?: boolean;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, small && { fontSize: 18 }, { color: accent }]} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.metricUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function truncateId(id: string | null | undefined, len: number): string {
  if (!id) return '--';
  return id.length > len ? `${id.slice(0, len)}…` : id;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060A' },
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  brand: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', letterSpacing: 1.5 },
  subtitle: { color: '#8B8CA3', fontSize: 11, marginTop: 2, letterSpacing: 1 },
  powerWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { color: '#8B8CA3', fontSize: 12, letterSpacing: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
  hero: { alignItems: 'center', paddingVertical: 6 },
  zoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: -10,
  },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  zoneText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  metricRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: '#0C0D14',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1C2030',
    padding: 14,
  },
  metricLabel: { color: '#8B8CA3', fontSize: 11, letterSpacing: 0.5 },
  metricValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', marginTop: 6, fontVariant: ['tabular-nums'] },
  metricUnit: { fontSize: 12, color: '#8B8CA3', fontWeight: '500' },
  stateCard: {
    backgroundColor: '#0C0D14',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  stateRow: { flexDirection: 'row', alignItems: 'center' },
  stateTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  stateHint: { color: '#8B8CA3', fontSize: 12, marginTop: 2 },
  autoOff: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 10,
    backgroundColor: '#13141D',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  autoOffText: { color: '#8B8CA3', fontSize: 11 },
  controlRow: { flexDirection: 'row', gap: 12 },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
  },
  lockBtn: { borderColor: '#BF6BFF45', backgroundColor: '#BF6BFF0D' },
  unlockBtn: { borderColor: '#00F0FF45', backgroundColor: '#00F0FF0D' },
  controlText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  logCard: { backgroundColor: '#0C0D14', borderRadius: 20, borderWidth: 1, borderColor: '#1C2030', padding: 16 },
  logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  logTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  logCount: { color: '#8B8CA3', fontSize: 12, backgroundColor: '#171923', paddingHorizontal: 9, paddingVertical: 2, borderRadius: 999 },
  emptyLog: { paddingVertical: 14, alignItems: 'center' },
  emptyLogText: { color: '#5C5E73', fontSize: 12 },
  logRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#1C2030' },
  logIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  logAction: { color: '#E8E9F2', fontSize: 13, fontWeight: '600' },
  logMeta: { color: '#8B8CA3', fontSize: 11, marginTop: 2, fontVariant: ['tabular-nums'] },
  logOk: { fontSize: 14, fontWeight: '800' },
});
/**
 * DistanceRing —— 暗黑科技风环形距离仪表盘
 * 用 SVG 圆环展示当前距离与目标（锁车/解锁阈值）的相对位置。
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

export type DistanceZone = 'near' | 'middle' | 'far' | 'unknown';

/** 依据阈值将距离映射为“远/中/近/未知”区域 */
export function distanceZone(
  distance: number | null,
  unlockThreshold: number,
  lockThreshold: number
): DistanceZone {
  if (distance === null) return 'unknown';
  if (distance <= unlockThreshold) return 'near';
  if (distance <= lockThreshold) return 'middle';
  return 'far';
}

/** 依据区域返回霓虹主色（暗黑科技风配色） */
export function zoneColor(zone: DistanceZone): string {
  switch (zone) {
    case 'near':
      return '#00F0FF'; // 霓虹青：已到达 → 解锁区
    case 'middle':
      return '#FFB020'; // 琥珀：接近中
    case 'far':
      return '#BF6BFF'; // 霓虹紫：远离 → 锁车区
    default:
      return '#3A3A4A';
  }
}

export function formatDistance(distance: number | null): string {
  if (distance === null || !Number.isFinite(distance)) return '--.--';
  if (distance >= 100) return distance.toFixed(0);
  if (distance >= 10) return distance.toFixed(1);
  return distance.toFixed(2);
}

interface DistanceRingProps {
  distance: number | null;
  unlockThreshold: number;
  lockThreshold: number;
  zone: DistanceZone;
  size?: number;
  strokeWidth?: number;
}

export default function DistanceRing({
  distance,
  unlockThreshold,
  lockThreshold,
  zone,
  size = 260,
  strokeWidth = 14,
}: DistanceRingProps) {
  const color = zoneColor(zone);
  const maxRange = Math.max(lockThreshold * 2, 20, distance ?? 0);
  const progress = distance === null ? 0 : Math.min(1, Math.max(0, distance / maxRange));
  // 取反向：环越满代表越接近车辆
  const reach = 1 - progress;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - reach);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* 轨道 */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#151823"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* 进度弧 */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          opacity={0.9}
        />
        {/* 阈值刻度：解锁阈值 */}
        <MarkerThing
          size={size}
          radius={radius}
          ratio={Math.min(1, unlockThreshold / maxRange)}
          color="#00F0FF"
        />
        {/* 阈值刻度：锁车阈值 */}
        <MarkerThing
          size={size}
          radius={radius}
          ratio={Math.min(1, lockThreshold / maxRange)}
          color="#BF6BFF"
        />
      </Svg>

      <View style={styles.center}>
        <Text style={[styles.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatDistance(distance)}
        </Text>
        <Text style={styles.unit}>当前距离 · 米</Text>
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#00F0FF' }]} />
            <Text style={styles.legendText}>解锁 {unlockThreshold}m</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#BF6BFF' }]} />
            <Text style={styles.legendText}>锁车 {lockThreshold}m</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** 阈值刻度小圆点 */
function MarkerThing({
  size,
  radius,
  ratio,
  color,
}: {
  size: number;
  radius: number;
  ratio: number;
  color: string;
}) {
  if (ratio <= 0.01 || ratio >= 1) return null;
  const angle = -90 + 360 * (1 - ratio); // 与进度弧同向：max=0 在顶部顺时针
  const rad = (angle * Math.PI) / 180;
  const cx = size / 2 + radius * Math.cos(rad);
  const cy = size / 2 + radius * Math.sin(rad);
  return (
    <Circle cx={cx} cy={cy} r={5} stroke="#05060A" strokeWidth={2} fill={color} />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  value: {
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    marginTop: 2,
    fontSize: 12,
    color: '#8B8CA3',
    letterSpacing: 2,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#8B8CA3',
    fontVariant: ['tabular-nums'],
  },
});
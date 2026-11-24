import { Tabs } from 'expo-router';
import { Platform, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome6 } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const [background, muted, accent, border] = useCSSVariable([
    '--color-background',
    '--color-muted',
    '--color-accent',
    '--color-border',
  ]) as string[];

  let tabBarStyle: ViewStyle = {
    backgroundColor: '#0A0B11',
    borderTopWidth: 1,
    borderTopColor: '#1C2030',
    paddingBottom: Math.max(insets.bottom, 8),
  };

  // 用于修复 Web 上高度异常的问题（这个 if 逻辑必须添加）
  if (Platform.OS === 'web') {
    tabBarStyle = {
      ...tabBarStyle,
      height: 'auto',
    };
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: '#00F0FF',
        tabBarInactiveTintColor: muted || '#8B8CA3',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '钥匙',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="car" size={20} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ color }) => (
            <FontAwesome6 name="sliders" size={20} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
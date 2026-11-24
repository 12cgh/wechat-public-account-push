import { ExpoConfig, ConfigContext } from 'expo/config';

const appName = process.env.COZE_PROJECT_NAME || process.env.EXPO_PUBLIC_COZE_PROJECT_NAME || '应用';
const projectId = process.env.COZE_PROJECT_ID || process.env.EXPO_PUBLIC_COZE_PROJECT_ID;
const slugAppName = projectId ? `app${projectId}` : 'myapp';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    "name": appName,
    "slug": slugAppName,
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "myapp",
    "userInterfaceStyle": "dark",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": `com.anonymous.x${projectId || '0'}`
    },
    "web": {
      "bundler": "metro",
      "output": "single",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      process.env.EXPO_PUBLIC_BACKEND_BASE_URL ? [
        "expo-router",
        {
          "origin": process.env.EXPO_PUBLIC_BACKEND_BASE_URL
        }
      ] : 'expo-router',
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": `允许蓝牙车钥匙App访问您的相册，以便您上传或保存图片。`,
          "cameraPermission": `允许蓝牙车钥匙App使用您的相机，以便您直接拍摄照片上传。`,
          "microphonePermission": `允许蓝牙车钥匙App访问您的麦克风，以便您拍摄带有声音的视频。`
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": `蓝牙车钥匙App需要通过蓝牙扫描车辆信标来感知距离（iOS 上蓝牙扫描需要定位权限），用于自动解锁/锁车。`,
          "locationAlwaysAndWhenInUsePermission": `蓝牙车钥匙App需要在后台通过蓝牙持续感知车辆距离，用于靠近自动解锁、离开自动锁车。`,
          "isIosBackgroundLocationEnabled": false
        }
      ],
      [
        "react-native-ble-plx",
        {
          "isBackgroundEnabled": true,
          "neverForLocation": true,
          "modes": ["central"],
          "bluetoothAlwaysPermission": `蓝牙车钥匙App需要使用蓝牙连接/扫描车辆信标（BLE Beacon）以感知距离并自动执行解锁/锁车。`
        }
      ],
      [
        "expo-notifications",
        {
          "icon": "./assets/images/icon.png",
          "color": "#00F0FF"
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": `蓝牙车钥匙App需要访问相机以拍摄照片和视频。`,
          "microphonePermission": `蓝牙车钥匙App需要访问麦克风以录制视频声音。`,
          "recordAudioAndroid": true
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}

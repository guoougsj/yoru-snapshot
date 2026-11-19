import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yoru.asmr',
  appName: 'YORU 夜音',
  webDir: 'dist',
  backgroundColor: '#0c0d0f',
  android: {
    backgroundColor: '#0c0d0f',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;

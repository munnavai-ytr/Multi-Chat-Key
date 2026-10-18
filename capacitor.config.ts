import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.chatly.app',
  appName: 'Chatly',
  webDir: 'out',
  server: process.env.APP_URL
    ? {
        url: process.env.APP_URL,
        cleartext: false,
      }
    : undefined,
  android: {
    allowMixedContent: false,
  },
};

export default config;

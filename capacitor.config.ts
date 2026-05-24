import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.feiralivre.calculadora',
  appName: 'Feira Livre Calculadora',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;

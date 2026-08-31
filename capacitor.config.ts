import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.trim().replace(/\/$/, "") ||
  process.env.NEXT_PUBLIC_HTTPS_APP_URL?.trim().replace(/\/$/, "") ||
  "https://syno-nas.tailf9872a.ts.net";

const config: CapacitorConfig = {
  appId: "com.traveltoblog.app",
  appName: "TravelToBlog",
  webDir: "capacitor-www",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;

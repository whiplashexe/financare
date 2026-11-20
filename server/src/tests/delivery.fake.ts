import { mailClient, type Mail } from "../lib/mailer.js";
import {
  pushClient,
  type PushDevice,
  type PushMessage,
  type PushResult,
} from "../lib/push.js";

const originalPush = { ...pushClient };
const originalMail = { ...mailClient };

export const fakeDelivery = {
  pushConfigured: true,
  mailConfigured: true,
  pushCalls: [] as { devices: PushDevice[]; message: PushMessage }[],
  mails: [] as Mail[],
  pushOutcome: (devices: PushDevice[]): PushResult[] =>
    devices.map((device) => ({ token: device.token, result: "ok" })),
  mailFails: false,

  install() {
    Object.assign(pushClient, {
      isConfigured: () => this.pushConfigured,
      send: async (devices: PushDevice[], message: PushMessage) => {
        this.pushCalls.push({ devices, message });
        return this.pushOutcome(devices);
      },
    });
    Object.assign(mailClient, {
      isConfigured: () => this.mailConfigured,
      send: async (mail: Mail) => {
        if (this.mailFails) throw new Error("mail failure");
        this.mails.push(mail);
      },
    });
  },

  restore() {
    Object.assign(pushClient, originalPush);
    Object.assign(mailClient, originalMail);
  },

  reset() {
    this.pushConfigured = true;
    this.mailConfigured = true;
    this.mailFails = false;
    this.pushCalls.length = 0;
    this.mails.length = 0;
    this.pushOutcome = (devices) =>
      devices.map((device) => ({ token: device.token, result: "ok" }));
  },
};

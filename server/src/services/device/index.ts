import { registerDevice } from "./device.register.service.js";
import { removeDevice } from "./device.remove.service.js";

export default class DeviceService {
  static register = registerDevice;
  static remove = removeDevice;
}

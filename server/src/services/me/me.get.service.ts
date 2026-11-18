import { findActiveProfile } from "../../utils/profile.util.js";

export const getProfile = async ({ userId }: { userId: string }) =>
  findActiveProfile(userId);

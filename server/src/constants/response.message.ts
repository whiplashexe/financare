export const API_MESSAGE = {
  SUCCESS: "Success",
  CREATED: "Created successfully",
  UPDATED: "Updated successfully",
  DELETED: "Deleted successfully",
  FETCHED: "Fetched successfully",

  BAD_REQUEST: "Bad request",
  VALIDATION_FAILED: "Validation failed",
  NOT_FOUND: "Resource not found",
  CONFLICT: "Resource already exists",
  TOO_MANY_REQUESTS: "Too many requests, please try again later",
  INTERNAL_SERVER_ERROR: "Something went wrong, please try again later",
  SERVICE_UNAVAILABLE: "Service temporarily unavailable",
} as const;

export const CRUD_MESSAGE = {
  created: (resource: string) => `${resource} created successfully`,
  updated: (resource: string) => `${resource} updated successfully`,
  deleted: (resource: string) => `${resource} deleted successfully`,
  fetched: (resource: string) => `${resource} fetched successfully`,
  listed: (resource: string) => `${resource} list fetched successfully`,
  notFound: (resource: string) => `${resource} not found`,
  alreadyExists: (resource: string) => `${resource} already exists`,
  createFailed: (resource: string) => `Failed to create ${resource}`,
  updateFailed: (resource: string) => `Failed to update ${resource}`,
  deleteFailed: (resource: string) => `Failed to delete ${resource}`,
  fetchFailed: (resource: string) => `Failed to fetch ${resource}`,
} as const;

export const AUTH_MESSAGE = {
  LOGIN_SUCCESS: "Login successful",
  LOGOUT_SUCCESS: "Logout successful",
  REGISTER_SUCCESS: "Registration successful",
  TOKEN_REFRESHED: "Token refreshed successfully",
  PASSWORD_CHANGED: "Password changed successfully",
  PASSWORD_RESET_SENT: "Password reset link has been sent to your email",
  PASSWORD_RESET_REQUESTED:
    "If the email is registered, a password reset link has been sent",
  RESET_TOKEN_INVALID: "Reset token is invalid or has expired",
  TOKEN_REFRESHED_INVALID: "Refresh token is invalid",
  PASSWORD_RESET_SUCCESS: "Password has been reset successfully",
  EMAIL_VERIFIED: "Email verified successfully",
  VERIFICATION_SENT: "Verification email has been sent",

  UNAUTHORIZED: "You must be logged in to access this resource",
  FORBIDDEN: "You don't have permission to access this resource",
  INVALID_CREDENTIALS: "Invalid email or password",
  TOO_MANY_LOGIN_ATTEMPTS:
    "Too many failed login attempts, please try again later",
  TOKEN_MISSING: "Authentication token is missing",
  TOKEN_INVALID: "Authentication token is invalid",
  TOKEN_EXPIRED: "Authentication token has expired",
  SESSION_EXPIRED: "Your session has expired, please log in again",
  EMAIL_NOT_VERIFIED: "Please verify your email first",
  EMAIL_ALREADY_EXISTS: "Email is already registered",
  ACCOUNT_DISABLED: "Your account has been disabled",
  USER_NOT_FOUND: "User not found",
  PASSWORD_MISMATCH: "Passwords do not match",
  OLD_PASSWORD_INCORRECT: "Old password is incorrect",
  PASSWORD_INCORRECT: "Password is incorrect",
} as const;

export const ME_MESSAGE = {
  PROFILE_FETCHED: "Profile fetched successfully",
  PROFILE_UPDATED: "Profile updated successfully",
  PASSWORD_CHANGED: "Password changed successfully",
  NOTIFICATION_PREFERENCES_UPDATED:
    "Notification preferences updated successfully",
  PREFERENCES_UPDATED: "Preferences updated successfully",
  ACCOUNT_DELETION_SCHEDULED: "Account deletion has been scheduled",
  DEVICE_REGISTERED: "Device registered successfully",
  DEVICE_REMOVED: "Device removed successfully",
  DEVICE_NOT_FOUND: "Device not found",
} as const;

export const ACCOUNT_MESSAGE = {
  LISTED: "Accounts fetched successfully",
  FETCHED: "Account fetched successfully",
  CREATED: "Account created successfully",
  UPDATED: "Account updated successfully",
  DELETED: "Account deleted successfully",
  ARCHIVED: "Account archived successfully",
  UNARCHIVED: "Account unarchived successfully",
  NOT_FOUND: "Account not found",
  HAS_TRANSACTIONS:
    "Account has transactions (including those in the trash) and cannot be deleted",
  HAS_RECURRING_PLANS:
    "Account is used by recurring plans and cannot be deleted",
  CONFIRM_INITIAL_BALANCE:
    "Changing the initial balance of an account with transactions changes its current balance; repeat with confirm: true",
  CASH_NO_INSTITUTION: "A cash account cannot have an institution",
} as const;

export const CATEGORY_MESSAGE = {
  LISTED: "Categories fetched successfully",
  CREATED: "Category created successfully",
  UPDATED: "Category updated successfully",
  DELETED: "Category deleted successfully",
  NOT_FOUND: "Category not found",
  NAME_EXISTS: "A category with this name already exists for this type",
  FALLBACK_PROTECTED: "The fallback category cannot be renamed or deleted",
  CONFIRM_DELETE:
    "Deleting this category moves its transactions to the fallback category; repeat with confirm=true",
} as const;

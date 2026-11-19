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
  ARCHIVED_NOT_ALLOWED: "Account is archived",
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

export const TRANSACTION_MESSAGE = {
  LISTED: "Transactions fetched successfully",
  FETCHED: "Transaction fetched successfully",
  CREATED: "Transaction created successfully",
  NOT_FOUND: "Transaction not found",
  FUTURE_DATE:
    "The date cannot be in the future; create a one-time plan for future payments",
  CATEGORY_TYPE_MISMATCH: "The category type must match the transaction type",
  PLAN_NOT_FOUND: "Plan not found",
  TEMPLATE_NOT_FOUND: "Template not found",
  INVALID_CURSOR: "The cursor is invalid",
  UPDATED: "Transaction updated successfully",
  DELETED: "Transaction deleted successfully",
  RESTORED: "Transaction restored successfully",
  TRASH_LISTED: "Trash fetched successfully",
  FEE_IS_LINKED:
    "An admin fee is managed through its transfer; change the transfer instead",
  TRANSFER_NEEDS_DESTINATION: "A transfer needs a destination account",
  TRANSFER_SAME_ACCOUNT: "Source and destination must differ",
  TRANSFER_NO_CATEGORY: "A transfer has no category; send category_id: null",
  TRANSFER_NO_ITEMS: "A transfer cannot have items; send items: []",
  NON_TRANSFER_DESTINATION:
    "Only a transfer has a destination account; send to_account_id: null",
  NON_TRANSFER_FEE: "Only a transfer has an admin fee",
} as const;

export const TEMPLATE_MESSAGE = {
  LISTED: "Templates fetched successfully",
  FETCHED: "Template fetched successfully",
  CREATED: "Template created successfully",
  UPDATED: "Template updated successfully",
  DELETED: "Template deleted successfully",
  NOT_FOUND: "Template not found",
  NAME_EXISTS: "A template with this name already exists",
  SOURCE_NOT_FOUND: "Source transaction not found",
  INCOMPLETE:
    "The template and the overrides do not provide every required value",
  TYPE_REQUIRED: "type is required when there is no source transaction",
  TRANSACTION_NAME_REQUIRED:
    "transaction_name is required when there is no source transaction",
  CATEGORY_TYPE_MISMATCH: "The category type must match the template type",
  TRANSFER_NEEDS_NO_CATEGORY: "A transfer has no category; send category_id: null",
  ONLY_TRANSFER_DESTINATION:
    "Only a transfer has a destination account; send to_account_id: null",
  SAME_ACCOUNT: "Source and destination must differ",
} as const;

export const PLAN_MESSAGE = {
  LISTED: "Recurring plans fetched successfully",
  FETCHED: "Recurring plan fetched successfully",
  CREATED: "Recurring plan created successfully",
  UPDATED: "Recurring plan updated successfully",
  DELETED: "Recurring plan deleted successfully",
  PAUSED: "Recurring plan paused successfully",
  RESUMED: "Recurring plan resumed successfully",
  CONFIRMED: "Occurrence confirmed successfully",
  SKIPPED: "Occurrence skipped successfully",
  NOT_FOUND: "Recurring plan not found",
  START_IN_PAST: "The start date cannot be in the past",
  END_BEFORE_START: "The end date must be after the start date",
  PLAN_ENDED: "The plan has ended and can no longer be changed",
  NOT_ACTIVE: "The plan is not active",
  NOT_A_DUE_DATE: "This is not the plan's current due date",
  ALREADY_RESOLVED: "This period has already been resolved",
  CATEGORY_TYPE_MISMATCH: "The category type must match the plan type",
  DUPLICATE_OFFSETS: "reminder_offsets must not repeat a value",
} as const;

export const ONE_TIME_MESSAGE = {
  LISTED: "One-time plans fetched successfully",
  FETCHED: "One-time plan fetched successfully",
  CREATED: "One-time plan created successfully",
  UPDATED: "One-time plan updated successfully",
  DELETED: "One-time plan deleted successfully",
  COMPLETED: "One-time plan completed successfully",
  CANCELLED: "One-time plan cancelled successfully",
  NOT_FOUND: "One-time plan not found",
  DATE_IN_PAST: "The date cannot be in the past",
  NOT_EDITABLE: "A plan that is done or cancelled can no longer be changed",
  ALREADY_DONE: "The plan is already done",
  ALREADY_CANCELLED: "The plan has been cancelled",
  TRANSACTION_FIELDS_NEED_FLAG:
    "amount, account_id and date are only used with create_transaction: true",
  ACCOUNT_REQUIRED:
    "An account is needed to record the transaction: send account_id or set a source account",
  DUPLICATE_OFFSETS: "reminder_offsets must not repeat a value",
} as const;

/**
 * Authentication workflow modes.
 */
export const AUTH_MODES = Object.freeze({
  SIGNIN: 'signin',
  SIGNUP: 'signup',
  FORGOT: 'forgot',
});

/**
 * Centrally organized labels, notices, and UI copy for authentication flows.
 */
export const AUTH_LABELS = Object.freeze({
  TITLES: {
    [AUTH_MODES.FORGOT]: 'Reset your password',
    [AUTH_MODES.SIGNUP]: 'Create your workspace',
    [AUTH_MODES.SIGNIN]: 'Welcome back',
  },
  DESCRIPTIONS: {
    [AUTH_MODES.FORGOT]: 'Enter your email and we’ll send a secure reset link.',
    [AUTH_MODES.SIGNUP]: 'Set up your Spendwise workspace in a few moments.',
    [AUTH_MODES.SIGNIN]: 'Sign in to continue managing your money with confidence.',
  },
  KICKERS: {
    [AUTH_MODES.FORGOT]: 'ACCOUNT RECOVERY',
    [AUTH_MODES.SIGNUP]: 'GET STARTED',
    [AUTH_MODES.SIGNIN]: 'SECURE ACCESS',
  },
  BUTTONS: {
    SUBMIT_FORGOT: 'Send reset link',
    SUBMIT_SIGNUP: 'Create account',
    SUBMIT_SIGNIN: 'Sign in',
    SUBMIT_LOADING: 'Please wait…',
    GOOGLE_SIGNIN: 'Continue with Google',
    SWITCH_TO_SIGNIN: 'Sign in',
    SWITCH_TO_SIGNUP: 'Create an account',
    FORGOT_PASSWORD: 'Forgot password?',
  },
  SWITCH_PROMPTS: {
    FORGOT: 'Remember your password?',
    SIGNUP: 'Already have an account?',
    SIGNIN: 'New to Spendwise?',
  },
  NOTICES: {
    RESET_SUCCESS: 'Password updated. Sign in using your new password.',
    NOT_CONFIGURED: 'Authentication is not configured for this environment. Add the public VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY variables to enable sign-in.',
    NOT_CONFIGURED_GENERIC: 'Authentication is not configured for this environment.',
    RESET_LINK_SENT: 'If an account exists for that email, a password-reset link has been sent.',
    ACCOUNT_EXISTS: 'An account with this email address already exists. Please sign in or reset your password.',
    CONFIRM_EMAIL: 'Check your email to confirm your account before signing in.',
    VALIDATION_SUMMARY: 'Please correct the highlighted fields and try again.',
    TERMS_NOTICE: 'By creating an account, you agree to the terms and privacy policy that will be provided when authentication is enabled.',
  },
  VALIDATION: {
    NAME_REQUIRED: 'Enter the name you want to use in Spendwise.',
    EMAIL_INVALID: 'Enter a valid email address.',
    PASSWORD_LENGTH: 'Use at least 8 characters.',
    PASSWORD_MISMATCH: 'Passwords do not match.',
  },
});

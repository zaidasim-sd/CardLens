export const WORK_EMAIL_MESSAGE = 'Please use a work email at aventureaviation.com or vision71tech.com.';

export function isAllowedWorkEmail(email, allowTestAccounts = false) {
  if (typeof email !== 'string') return false;
  const value = email.trim().toLowerCase();
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || /\s/.test(value)) return false;
  return ['aventureaviation.com', 'vision71tech.com'].includes(parts[1]) || (allowTestAccounts && parts[1] === 'example.test');
}

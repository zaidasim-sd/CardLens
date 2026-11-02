export const STAGING_CLIENT_BLOCK_MESSAGE: string;
export function isStagingDeployment(env?: Record<string, unknown>, hostname?: string): boolean;
export function isBlockedClientEmail(email: unknown): boolean;
export function assertStagingClientEmailAllowed(email: unknown, env?: Record<string, unknown>, hostname?: string): void;

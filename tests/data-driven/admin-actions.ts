import type { ActionConfig } from "./models";

function maskValue(value: string | undefined): string {
  if (!value) return 'not set';
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export async function runDeleteUserIfExistsAsSuperAdminAction(
  action: ActionConfig,
  targetUserIdentifier: string | number | boolean | undefined,
): Promise<void> {
  const superAdminUsername = process.env.SUPER_ADMIN_USERNAME;
  const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;
  const targetUser = targetUserIdentifier === undefined ? '' : String(targetUserIdentifier);

  console.log('[TODO] Super admin user cleanup prerequisite triggered.');
  console.log(`[TODO] Super admin username from .env: ${maskValue(superAdminUsername)}`);
  console.log(`[TODO] Target user identifier: ${targetUser || 'not provided'}`);

  if (!superAdminUsername || !superAdminPassword) {
    console.warn('[TODO] Set SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD in the .env file before implementing the API calls.');
  }

  if (!targetUser) {
    console.warn(`[TODO] Action "${action.name ?? action.type ?? 'deleteUserIfExistsAsSuperAdmin'}" does not define a target user value. Provide "value" or "valueEnv" in the JSON test case.`);
  }

  console.log('[TODO] Step 1: Call the super admin login API and obtain an access token/session.');
  console.log('[TODO] Step 2: Call the user search API using the target user identifier.');
  console.log('[TODO] Step 3: If the user exists, call the user delete API.');
  console.log('[TODO] Step 4: Log the API responses and fail the test if cleanup cannot be completed when you implement the real API calls.');
}

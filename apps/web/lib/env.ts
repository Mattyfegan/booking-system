import { validateEnv } from "@booking/config";

// Validated once at module load. Throws with a readable Zod error if a required variable is missing.
export const env = validateEnv();

export const googleOAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

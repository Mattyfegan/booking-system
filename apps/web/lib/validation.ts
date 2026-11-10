import { z } from "zod";
import { isValidDateString } from "./availability";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated.
  password: z.string().min(8).max(72),
  role: z.enum(["CUSTOMER", "BUSINESS_OWNER"]).default("CUSTOMER"),
});

export const createBusinessSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().toLowerCase().min(2).max(60).regex(slugPattern, "Use lowercase letters, numbers and hyphens").optional(),
  description: z.string().trim().max(1000).nullish(),
  timezone: z.string().refine(isValidTimeZone, "Unknown IANA timezone").default("UTC"),
});

export const updateBusinessSchema = createBusinessSchema.partial();

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullish(),
  durationMin: z.number().int().min(5).max(480),
  priceCents: z.number().int().min(0).max(1_000_000),
  bufferMin: z.number().int().min(0).max(120).default(0),
});

export const updateServiceSchema = createServiceSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm");
const isoDate = z.string().refine(isValidDateString, "Use a real date in YYYY-MM-DD format");

const availabilityRuleBase = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeOfDay,
  endTime: timeOfDay,
});

export const createAvailabilityRuleSchema = availabilityRuleBase.refine((v) => v.startTime < v.endTime, {
  message: "endTime must be after startTime",
  path: ["endTime"],
});

export const updateAvailabilityRuleSchema = availabilityRuleBase
  .partial()
  .refine((v) => v.startTime === undefined || v.endTime === undefined || v.startTime < v.endTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

// An override either closes the day or replaces the weekly hours for that date. It cannot be a no-op.
export const availabilityOverrideSchema = z
  .object({
    date: isoDate,
    isClosed: z.boolean().default(false),
    startTime: timeOfDay.nullish(),
    endTime: timeOfDay.nullish(),
  })
  .superRefine((v, ctx) => {
    if (v.isClosed) {
      if (v.startTime || v.endTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A closed day cannot have hours", path: ["isClosed"] });
      }
      return;
    }
    if (!v.startTime || !v.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide startTime and endTime, or set isClosed to true",
        path: ["startTime"],
      });
    } else if (v.startTime >= v.endTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "endTime must be after startTime", path: ["endTime"] });
    }
  });

export const availabilityQuerySchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  date: isoDate,
});

export const createBookingSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  startAt: z.string().datetime({ offset: true, message: "Use an ISO 8601 timestamp" }),
  notes: z.string().trim().max(500).nullish(),
});

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type CreateAvailabilityRuleInput = z.infer<typeof createAvailabilityRuleSchema>;
export type UpdateAvailabilityRuleInput = z.infer<typeof updateAvailabilityRuleSchema>;
export type AvailabilityOverrideInput = z.infer<typeof availabilityOverrideSchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

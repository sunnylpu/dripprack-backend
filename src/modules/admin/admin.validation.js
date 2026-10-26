import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const httpsUrlRegex = /^https:\/\/[^\s$.?#].[^\s]*$/i;

export const adminOrderListQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(10),
      orderStatus: z
        .enum([
          'awaiting_payment',
          'confirmed',
          'processing',
          'shipped',
          'delivered',
          'cancelled'
        ])
        .optional(),
      paymentStatus: z
        .enum(['pending', 'paid', 'failed', 'refunded', 'cod_due'])
        .optional(),
      paymentMethod: z.enum(['cod', 'online']).optional(),
      startDate: z
        .string()
        .datetime({ message: 'startDate must be a valid ISO 8601 date string' })
        .optional(),
      endDate: z
        .string()
        .datetime({ message: 'endDate must be a valid ISO 8601 date string' })
        .optional(),
      search: z.string().trim().max(100, 'Search query cannot exceed 100 characters').optional()
    })
    .strip()
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.startDate) <= new Date(data.endDate);
        }
        return true;
      },
      {
        message: 'startDate must be less than or equal to endDate',
        path: ['startDate']
      }
    )
};

export const adminOrderParamsSchema = {
  params: z
    .object({
      reference: z
        .string({ required_error: 'Order reference is required' })
        .trim()
        .min(1, 'Order reference cannot be empty')
        .max(50, 'Order reference cannot exceed 50 characters')
    })
    .strict()
};

const trackingSchema = z
  .object({
    carrier: z
      .string({ required_error: 'Carrier is required' })
      .trim()
      .min(2, 'Carrier must be at least 2 characters')
      .max(100, 'Carrier cannot exceed 100 characters'),
    trackingNumber: z
      .string({ required_error: 'Tracking number is required' })
      .trim()
      .min(3, 'Tracking number must be at least 3 characters')
      .max(100, 'Tracking number cannot exceed 100 characters'),
    trackingUrl: z
      .string({ required_error: 'Tracking URL is required' })
      .trim()
      .url('Tracking URL must be a valid URL')
      .regex(httpsUrlRegex, 'Tracking URL must use the secure HTTPS protocol')
  })
  .strict('Unexpected fields in tracking payload are not permitted');

export const adminOrderStatusUpdateSchema = {
  params: z
    .object({
      reference: z
        .string({ required_error: 'Order reference is required' })
        .trim()
        .min(1, 'Order reference cannot be empty')
        .max(50, 'Order reference cannot exceed 50 characters')
    })
    .strict(),
  body: z
    .object({
      status: z.enum(['processing', 'shipped', 'delivered'], {
        required_error: 'Target order status is required',
        invalid_type_error: "Status must be 'processing', 'shipped', or 'delivered'"
      }),
      tracking: trackingSchema.optional(),
      codPaymentCollected: z.boolean().optional()
    })
    .strict('Unexpected fields in request payload are not permitted')
    .superRefine((data, ctx) => {
      if (data.status === 'shipped' && !data.tracking) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Tracking details (carrier, trackingNumber, trackingUrl) are required when transitioning to shipped',
          path: ['tracking']
        });
      }
    })
};

export const adminOrderCancelSchema = {
  params: z
    .object({
      reference: z
        .string({ required_error: 'Order reference is required' })
        .trim()
        .min(1, 'Order reference cannot be empty')
        .max(50, 'Order reference cannot exceed 50 characters')
    })
    .strict(),
  body: z
    .object({
      reason: z
        .string()
        .trim()
        .min(3, 'Cancellation reason must be at least 3 characters')
        .max(500, 'Cancellation reason cannot exceed 500 characters')
        .optional()
    })
    .strict('Unexpected fields in request payload are not permitted')
    .optional()
};

export const adminAuditLogQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      actor: z
        .string()
        .regex(objectIdRegex, 'Invalid actor ID format')
        .optional(),
      action: z.string().trim().max(100).optional(),
      resourceType: z.string().trim().max(100).optional(),
      resourceId: z.string().trim().max(100).optional(),
      startDate: z
        .string()
        .datetime({ message: 'startDate must be a valid ISO 8601 date string' })
        .optional(),
      endDate: z
        .string()
        .datetime({ message: 'endDate must be a valid ISO 8601 date string' })
        .optional()
    })
    .strip()
    .refine(
      (data) => {
        if (data.startDate && data.endDate) {
          return new Date(data.startDate) <= new Date(data.endDate);
        }
        return true;
      },
      {
        message: 'startDate must be less than or equal to endDate',
        path: ['startDate']
      }
    )
};

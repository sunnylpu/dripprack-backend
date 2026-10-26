import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const allowedStockSortFields = [
  'sku:asc',
  'sku:desc',
  'name:asc',
  'name:desc',
  'physical:asc',
  'physical:desc',
  'available:asc',
  'available:desc',
  'createdAt:asc',
  'createdAt:desc'
];

const allowedMovementSortFields = [
  'createdAt:desc',
  'createdAt:asc'
];

export const adjustStockSchema = {
  headers: z
    .object({
      'idempotency-key': z
        .string()
        .trim()
        .min(1, 'Idempotency key cannot be empty')
        .max(128, 'Idempotency key cannot exceed 128 characters')
        .optional()
    })
    .passthrough(),
  body: z
    .object({
      productId: z
        .string({ required_error: 'Product ID is required' })
        .regex(objectIdRegex, 'Invalid product ID format'),
      quantityDelta: z
        .number({ required_error: 'Quantity delta is required' })
        .int('Quantity delta must be an integer')
        .refine((val) => val !== 0, {
          message: 'Quantity delta must be a nonzero integer'
        })
        .refine((val) => val >= -100000 && val <= 100000, {
          message: 'Quantity delta magnitude must be between -100,000 and 100,000'
        }),
      reason: z
        .string({ required_error: 'Reason is required' })
        .trim()
        .min(3, 'Reason must be at least 3 characters')
        .max(500, 'Reason cannot exceed 500 characters')
    })
    .strict('Unexpected fields in request payload are not permitted')
};

export const stockListingQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      q: z.string().trim().max(100).optional(),
      category: z.string().trim().optional(),
      lowStockOnly: z.enum(['true', 'false']).optional(),
      inStock: z.enum(['true', 'false']).optional(),
      sortBy: z
        .string()
        .refine((val) => allowedStockSortFields.includes(val), {
          message: `Invalid sort field. Allowed values: ${allowedStockSortFields.join(', ')}`
        })
        .optional()
        .default('createdAt:desc')
    })
    .strip()
};

export const lowStockQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      q: z.string().trim().max(100).optional(),
      category: z.string().trim().optional(),
      sortBy: z
        .string()
        .refine((val) => allowedStockSortFields.includes(val), {
          message: `Invalid sort field. Allowed values: ${allowedStockSortFields.join(', ')}`
        })
        .optional()
        .default('available:asc')
    })
    .strip()
};

export const movementsQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      productId: z
        .string()
        .regex(objectIdRegex, 'Invalid product ID format')
        .optional(),
      movementType: z
        .enum(['adjustment', 'reservation', 'release', 'sale', 'restock'])
        .optional(),
      actor: z
        .string()
        .regex(objectIdRegex, 'Invalid actor user ID format')
        .optional(),
      startDate: z
        .string()
        .datetime({ message: 'startDate must be a valid ISO 8601 date string' })
        .optional(),
      endDate: z
        .string()
        .datetime({ message: 'endDate must be a valid ISO 8601 date string' })
        .optional(),
      sortBy: z
        .string()
        .refine((val) => allowedMovementSortFields.includes(val), {
          message: `Invalid sort field. Allowed values: ${allowedMovementSortFields.join(', ')}`
        })
        .optional()
        .default('createdAt:desc')
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

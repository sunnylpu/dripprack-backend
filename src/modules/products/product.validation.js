import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const skuRegex = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const httpsUrlRegex = /^https:\/\/[^\s$.?#].[^\s]*$/i;

const allowedSortFields = [
  'name:asc',
  'name:desc',
  'priceCents:asc',
  'priceCents:desc',
  'createdAt:asc',
  'createdAt:desc'
];

export const productParamsSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid product ID format')
  })
};

export const productLookupParamsSchema = {
  params: z.object({
    idOrSlug: z.string().trim().min(1, 'Product identifier is required')
  })
};

export const createProductSchema = {
  body: z
    .object({
      sku: z
        .string({ required_error: 'SKU is required' })
        .trim()
        .toUpperCase()
        .min(3, 'SKU must be at least 3 characters')
        .max(50, 'SKU cannot exceed 50 characters')
        .regex(skuRegex, 'SKU must contain only uppercase alphanumeric characters and single hyphens (e.g. DRIP-HOODIE-BLK-M)'),
      name: z
        .string({ required_error: 'Product name is required' })
        .trim()
        .min(2, 'Product name must be at least 2 characters')
        .max(200, 'Product name cannot exceed 200 characters'),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(slugRegex, 'Slug must be valid kebab-case')
        .max(220)
        .optional(),
      description: z
        .string({ required_error: 'Product description is required' })
        .trim()
        .min(10, 'Description must be at least 10 characters')
        .max(5000, 'Description cannot exceed 5000 characters'),
      category: z
        .string({ required_error: 'Category ID is required' })
        .regex(objectIdRegex, 'Invalid category ID format'),
      priceCents: z
        .number({ required_error: 'Price in cents is required' })
        .int('Price must be an integer minor unit (cents)')
        .min(0, 'Price cannot be negative'),
      compareAtPriceCents: z
        .number()
        .int('Compare-at price must be an integer')
        .min(0, 'Compare-at price cannot be negative')
        .nullable()
        .optional(),
      images: z
        .array(z.string().regex(httpsUrlRegex, 'Image URL must be a valid secure HTTPS link'))
        .max(10, 'Cannot exceed 10 images')
        .optional()
        .default([]),
      status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
      lowStockThreshold: z.number().int().min(0).optional().default(5)
    })
    .strip()
    .refine(
      (data) => {
        if (data.compareAtPriceCents !== undefined && data.compareAtPriceCents !== null) {
          return data.compareAtPriceCents >= data.priceCents;
        }
        return true;
      },
      {
        message: 'Compare-at price cannot be less than selling price',
        path: ['compareAtPriceCents']
      }
    )
};

export const updateProductSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid product ID format')
  }),
  body: z
    .object({
      sku: z
        .string()
        .trim()
        .toUpperCase()
        .min(3, 'SKU must be at least 3 characters')
        .max(50, 'SKU cannot exceed 50 characters')
        .regex(skuRegex, 'SKU must contain only uppercase alphanumeric characters and single hyphens')
        .optional(),
      name: z
        .string()
        .trim()
        .min(2, 'Product name must be at least 2 characters')
        .max(200, 'Product name cannot exceed 200 characters')
        .optional(),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(slugRegex, 'Slug must be valid kebab-case')
        .max(220)
        .optional(),
      description: z
        .string()
        .trim()
        .min(10, 'Description must be at least 10 characters')
        .max(5000, 'Description cannot exceed 5000 characters')
        .optional(),
      category: z
        .string()
        .regex(objectIdRegex, 'Invalid category ID format')
        .optional(),
      priceCents: z
        .number()
        .int('Price must be an integer minor unit (cents)')
        .min(0, 'Price cannot be negative')
        .optional(),
      compareAtPriceCents: z
        .number()
        .int('Compare-at price must be an integer')
        .min(0, 'Compare-at price cannot be negative')
        .nullable()
        .optional(),
      images: z
        .array(z.string().regex(httpsUrlRegex, 'Image URL must be a valid secure HTTPS link'))
        .max(10, 'Cannot exceed 10 images')
        .optional(),
      lowStockThreshold: z.number().int().min(0).optional()
    })
    .strip()
    .refine(
      (data) => {
        if (
          data.priceCents !== undefined &&
          data.compareAtPriceCents !== undefined &&
          data.compareAtPriceCents !== null
        ) {
          return data.compareAtPriceCents >= data.priceCents;
        }
        return true;
      },
      {
        message: 'Compare-at price cannot be less than selling price',
        path: ['compareAtPriceCents']
      }
    )
};

export const updateProductStatusSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid product ID format')
  }),
  body: z
    .object({
      status: z.enum(['draft', 'published', 'archived'], {
        required_error: 'Status is required'
      })
    })
    .strip()
};

export const productQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      q: z.string().trim().max(100).optional(),
      category: z.string().trim().optional(),
      inStock: z.enum(['true', 'false']).optional(),
      sortBy: z
        .string()
        .refine((val) => allowedSortFields.includes(val), {
          message: `Invalid sort field. Allowed values: ${allowedSortFields.join(', ')}`
        })
        .optional()
        .default('createdAt:desc')
    })
    .strip()
};

export const adminProductQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      q: z.string().trim().max(100).optional(),
      category: z.string().trim().optional(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      inStock: z.enum(['true', 'false']).optional(),
      sortBy: z
        .string()
        .refine((val) => allowedSortFields.includes(val), {
          message: `Invalid sort field. Allowed values: ${allowedSortFields.join(', ')}`
        })
        .optional()
        .default('createdAt:desc')
    })
    .strip()
};

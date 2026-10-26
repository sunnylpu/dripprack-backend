import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const categoryParamsSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid category ID format')
  })
};

export const createCategorySchema = {
  body: z
    .object({
      name: z
        .string({ required_error: 'Category name is required' })
        .trim()
        .min(2, 'Category name must be at least 2 characters long')
        .max(60, 'Category name cannot exceed 60 characters'),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(slugRegex, 'Slug must be valid kebab-case (e.g. streetwear-hoodies)')
        .max(80, 'Slug cannot exceed 80 characters')
        .optional(),
      description: z
        .string()
        .trim()
        .max(500, 'Description cannot exceed 500 characters')
        .optional(),
      isActive: z.boolean().optional().default(true)
    })
    .strip()
};

export const updateCategorySchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid category ID format')
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(2, 'Category name must be at least 2 characters long')
        .max(60, 'Category name cannot exceed 60 characters')
        .optional(),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(slugRegex, 'Slug must be valid kebab-case (e.g. streetwear-hoodies)')
        .max(80, 'Slug cannot exceed 80 characters')
        .optional(),
      description: z
        .string()
        .trim()
        .max(500, 'Description cannot exceed 500 characters')
        .optional(),
      isActive: z.boolean().optional()
    })
    .strip()
};

export const adminCategoryQuerySchema = {
  query: z
    .object({
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
      includeInactive: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional()
    })
    .strip()
};

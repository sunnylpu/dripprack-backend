import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const httpsUrlRegex = /^https:\/\/[^\s$.?#].[^\s]*$/i;

export const projectParamsSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid project ID format')
  })
};

export const projectSlugParamsSchema = {
  params: z.object({
    slug: z.string().trim().min(1, 'Project slug is required')
  })
};

const galleryItemInputSchema = z.object({
  url: z.string().regex(httpsUrlRegex, 'Gallery image URL must be a valid secure HTTPS link'),
  layout: z.enum(['FULL_BLEED', 'TWO_UP_LEFT', 'TWO_UP_RIGHT', 'MOSAIC']).optional().default('FULL_BLEED'),
  caption: z.string().trim().max(300).nullable().optional()
});

export const createProjectSchema = {
  body: z.object({
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(150),
    slug: z.string().trim().toLowerCase().regex(slugRegex, 'Slug must be valid kebab-case').optional(),
    season: z.string().trim().max(50).nullable().optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    statement: z.string().trim().max(3000).nullable().optional(),
    heroMediaUrl: z.string().regex(httpsUrlRegex).nullable().optional(),
    gallery: z.array(galleryItemInputSchema).optional().default([]),
    taggedProducts: z.array(z.string().regex(objectIdRegex, 'Invalid product ID')).optional().default([]),
    isPublished: z.boolean().optional().default(true),
    sortOrder: z.number().int().optional().default(0)
  }).strip()
};

export const updateProjectSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid project ID format')
  }),
  body: z.object({
    title: z.string().trim().min(2).max(150).optional(),
    slug: z.string().trim().toLowerCase().regex(slugRegex).optional(),
    season: z.string().trim().max(50).nullable().optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    statement: z.string().trim().max(3000).nullable().optional(),
    heroMediaUrl: z.string().regex(httpsUrlRegex).nullable().optional(),
    gallery: z.array(galleryItemInputSchema).optional(),
    taggedProducts: z.array(z.string().regex(objectIdRegex)).optional(),
    isPublished: z.boolean().optional(),
    sortOrder: z.number().int().optional()
  }).strip()
};


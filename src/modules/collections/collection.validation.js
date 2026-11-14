import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const httpsUrlRegex = /^https:\/\/[^\s$.?#].[^\s]*$/i;

export const collectionParamsSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid collection ID format')
  })
};

export const collectionSlugParamsSchema = {
  params: z.object({
    slug: z.string().trim().min(1, 'Collection slug is required')
  })
};

export const createCollectionSchema = {
  body: z.object({
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(120),
    slug: z.string().trim().toLowerCase().regex(slugRegex, 'Slug must be valid kebab-case').optional(),
    type: z.enum(['DROP', 'CURATION', 'CORE', 'COLLABORATION']).optional().default('CURATION'),
    heroHeading: z.string().trim().max(200).nullable().optional(),
    heroSubheading: z.string().trim().max(300).nullable().optional(),
    bannerImageUrl: z.string().regex(httpsUrlRegex, 'Banner image URL must be a valid secure HTTPS link').nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    season: z.string().trim().max(50).nullable().optional(),
    isFeaturedOnHome: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
    sortOrder: z.number().int().optional().default(0),
    products: z.array(z.string().regex(objectIdRegex, 'Invalid product ID')).optional().default([])
  }).strip()
};

export const updateCollectionSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid collection ID format')
  }),
  body: z.object({
    title: z.string().trim().min(2).max(120).optional(),
    slug: z.string().trim().toLowerCase().regex(slugRegex).optional(),
    type: z.enum(['DROP', 'CURATION', 'CORE', 'COLLABORATION']).optional(),
    heroHeading: z.string().trim().max(200).nullable().optional(),
    heroSubheading: z.string().trim().max(300).nullable().optional(),
    bannerImageUrl: z.string().regex(httpsUrlRegex).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    season: z.string().trim().max(50).nullable().optional(),
    isFeaturedOnHome: z.boolean().optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    products: z.array(z.string().regex(objectIdRegex)).optional()
  }).strip()
};


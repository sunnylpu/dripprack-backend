import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const httpsUrlRegex = /^https:\/\/[^\s$.?#].[^\s]*$/i;

export const sectionIdParamsSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid section ID format')
  })
};

export const sectionKeyParamsSchema = {
  params: z.object({
    key: z.string().trim().min(1, 'Section key is required')
  })
};

export const sectionQuerySchema = {
  query: z
    .object({
      page: z.enum(['home', 'shop', 'about', 'support']).optional().default('home'),
      isActive: z.enum(['true', 'false']).optional()
    })
    .strip()
};

const mediaSchema = z
  .object({
    videoUrl: z.string().regex(httpsUrlRegex, 'Video URL must be a valid HTTPS link').nullable().optional(),
    posterUrl: z.string().regex(httpsUrlRegex, 'Poster URL must be a valid HTTPS link').nullable().optional(),
    imageUrl: z.string().regex(httpsUrlRegex, 'Image URL must be a valid HTTPS link').nullable().optional(),
    secondaryImageUrl: z.string().regex(httpsUrlRegex, 'Secondary image URL must be a valid HTTPS link').nullable().optional()
  })
  .optional();

const contentSchema = z
  .object({
    heading: z.string().trim().max(200).nullable().optional(),
    subheading: z.string().trim().max(500).nullable().optional(),
    caption: z.string().trim().max(500).nullable().optional(),
    badge: z.string().trim().max(50).nullable().optional()
  })
  .optional();

const ctaSchema = z
  .object({
    text: z.string().trim().max(100).nullable().optional(),
    link: z.string().trim().max(300).nullable().optional(),
    style: z.enum(['white', 'black', 'outline']).optional().default('white')
  })
  .optional();

const curationSchema = z
  .object({
    category: z.string().regex(objectIdRegex, 'Invalid category ID').nullable().optional(),
    products: z.array(z.string().regex(objectIdRegex, 'Invalid product ID')).optional(),
    modelSpecs: z.string().trim().max(300).nullable().optional()
  })
  .optional();

export const createSectionSchema = {
  body: z
    .object({
      sectionKey: z.string().trim().min(2, 'Section key is required').max(100),
      sectionName: z.string().trim().min(2, 'Section name is required').max(150),
      sectionType: z.enum([
        'HERO_VIDEO',
        'VIDEO_BANNER',
        'SHOP_THE_LOOK',
        'PRODUCT_FEED',
        'CAROUSEL',
        'CATEGORY_GRID',
        'IMAGE_BANNER',
        'NEWSLETTER'
      ]),
      page: z.enum(['home', 'shop', 'about', 'support']).optional().default('home'),
      sortOrder: z.number().int().min(1).max(100).optional().default(1),
      placementNotice: z.string().trim().min(5, 'Placement notice is required').max(300),
      media: mediaSchema,
      content: contentSchema,
      cta: ctaSchema,
      curation: curationSchema,
      isActive: z.boolean().optional().default(true)
    })
    .strip()
};

export const updateSectionSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid section ID format')
  }),
  body: z
    .object({
      sectionKey: z.string().trim().min(2).max(100).optional(),
      sectionName: z.string().trim().min(2).max(150).optional(),
      sectionType: z
        .enum([
          'HERO_VIDEO',
          'VIDEO_BANNER',
          'SHOP_THE_LOOK',
          'PRODUCT_FEED',
          'CAROUSEL',
          'CATEGORY_GRID',
          'IMAGE_BANNER',
          'NEWSLETTER'
        ])
        .optional(),
      page: z.enum(['home', 'shop', 'about', 'support']).optional(),
      sortOrder: z.number().int().min(1).max(100).optional(),
      placementNotice: z.string().trim().min(5).max(300).optional(),
      media: mediaSchema,
      content: contentSchema,
      cta: ctaSchema,
      curation: curationSchema,
      isActive: z.boolean().optional()
    })
    .strip()
};

export const toggleSectionStatusSchema = {
  params: z.object({
    id: z.string().regex(objectIdRegex, 'Invalid section ID format')
  }),
  body: z
    .object({
      isActive: z.boolean().optional()
    })
    .strip()
};


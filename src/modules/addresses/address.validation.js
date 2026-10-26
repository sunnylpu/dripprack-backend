import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
// Flexible phone regex accommodating E.164, national formats, parentheses, spaces, dots, hyphens
const phoneRegex = /^\+?[0-9\s\-().]{7,25}$/;
// Postal code regex accommodating alphanumeric, hyphens, and spaces
const postalCodeRegex = /^[a-zA-Z0-9\s\-]{2,20}$/;
// ISO 3166-1 alpha-2 country code
const countryCodeRegex = /^[a-zA-Z]{2}$/;

export const addressIdParamsSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Address ID is required' })
      .regex(objectIdRegex, 'Invalid address ID format')
  })
};

export const createAddressSchema = {
  body: z
    .object({
      recipientName: z
        .string({ required_error: 'Recipient name is required' })
        .trim()
        .min(2, 'Recipient name must be at least 2 characters')
        .max(100, 'Recipient name cannot exceed 100 characters'),
      phone: z
        .string({ required_error: 'Phone number is required' })
        .trim()
        .regex(phoneRegex, 'Invalid phone number format (e.g. +1 555-123-4567 or national number)'),
      streetAddress1: z
        .string({ required_error: 'Street address line 1 is required' })
        .trim()
        .min(3, 'Street address must be at least 3 characters')
        .max(150, 'Street address cannot exceed 150 characters'),
      streetAddress2: z
        .string()
        .trim()
        .max(150, 'Street address line 2 cannot exceed 150 characters')
        .optional()
        .default(''),
      city: z
        .string({ required_error: 'City is required' })
        .trim()
        .min(2, 'City must be at least 2 characters')
        .max(100, 'City cannot exceed 100 characters'),
      state: z
        .string({ required_error: 'State / Province is required' })
        .trim()
        .min(2, 'State must be at least 2 characters')
        .max(100, 'State cannot exceed 100 characters'),
      postalCode: z
        .string({ required_error: 'Postal code is required' })
        .trim()
        .regex(postalCodeRegex, 'Invalid postal code format (2-20 alphanumeric characters)'),
      country: z
        .string({ required_error: 'Country code is required' })
        .trim()
        .toUpperCase()
        .regex(countryCodeRegex, 'Country must be a 2-letter ISO country code (e.g. US, IN, CA)'),
      isDefault: z.boolean().optional()
    })
    .strict('Unexpected fields in request payload are not permitted')
};

export const updateAddressSchema = {
  params: z.object({
    id: z
      .string({ required_error: 'Address ID is required' })
      .regex(objectIdRegex, 'Invalid address ID format')
  }),
  body: z
    .object({
      recipientName: z
        .string()
        .trim()
        .min(2, 'Recipient name must be at least 2 characters')
        .max(100, 'Recipient name cannot exceed 100 characters')
        .optional(),
      phone: z
        .string()
        .trim()
        .regex(phoneRegex, 'Invalid phone number format')
        .optional(),
      streetAddress1: z
        .string()
        .trim()
        .min(3, 'Street address must be at least 3 characters')
        .max(150, 'Street address cannot exceed 150 characters')
        .optional(),
      streetAddress2: z
        .string()
        .trim()
        .max(150, 'Street address line 2 cannot exceed 150 characters')
        .optional(),
      city: z
        .string()
        .trim()
        .min(2, 'City must be at least 2 characters')
        .max(100, 'City cannot exceed 100 characters')
        .optional(),
      state: z
        .string()
        .trim()
        .min(2, 'State must be at least 2 characters')
        .max(100, 'State cannot exceed 100 characters')
        .optional(),
      postalCode: z
        .string()
        .trim()
        .regex(postalCodeRegex, 'Invalid postal code format')
        .optional(),
      country: z
        .string()
        .trim()
        .toUpperCase()
        .regex(countryCodeRegex, 'Country must be a 2-letter ISO country code')
        .optional(),
      isDefault: z.boolean().optional()
    })
    .strict('Unexpected fields in request payload are not permitted')
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field must be provided for update'
    })
};

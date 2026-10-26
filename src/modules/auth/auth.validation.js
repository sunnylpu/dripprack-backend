import { z } from 'zod';

const passwordComplexityRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,100}$/;

export const registerSchema = {
  body: z
    .object({
      email: z
        .string({ required_error: 'Email is required' })
        .trim()
        .toLowerCase()
        .email('Invalid email address format')
        .max(255, 'Email cannot exceed 255 characters'),
      password: z
        .string({ required_error: 'Password is required' })
        .min(8, 'Password must be at least 8 characters long')
        .max(100, 'Password cannot exceed 100 characters')
        .regex(
          passwordComplexityRegex,
          'Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character'
        ),
      firstName: z
        .string({ required_error: 'First name is required' })
        .trim()
        .min(2, 'First name must be at least 2 characters long')
        .max(50, 'First name cannot exceed 50 characters'),
      lastName: z
        .string({ required_error: 'Last name is required' })
        .trim()
        .min(2, 'Last name must be at least 2 characters long')
        .max(50, 'Last name cannot exceed 50 characters')
    })
    .strip()
};

export const loginSchema = {
  body: z
    .object({
      email: z
        .string({ required_error: 'Email is required' })
        .trim()
        .toLowerCase()
        .email('Invalid email address format'),
      password: z
        .string({ required_error: 'Password is required' })
        .min(1, 'Password cannot be empty')
    })
    .strip()
};

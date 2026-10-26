import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required']
    },
    recipientName: {
      type: String,
      required: [true, 'Recipient name is required'],
      trim: true,
      maxlength: [100, 'Recipient name cannot exceed 100 characters']
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: [25, 'Phone number cannot exceed 25 characters']
    },
    streetAddress1: {
      type: String,
      required: [true, 'Street address line 1 is required'],
      trim: true,
      maxlength: [150, 'Street address line 1 cannot exceed 150 characters']
    },
    streetAddress2: {
      type: String,
      default: '',
      trim: true,
      maxlength: [150, 'Street address line 2 cannot exceed 150 characters']
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters']
    },
    state: {
      type: String,
      required: [true, 'State / Province is required'],
      trim: true,
      maxlength: [100, 'State / Province cannot exceed 100 characters']
    },
    postalCode: {
      type: String,
      required: [true, 'Postal code is required'],
      trim: true,
      maxlength: [20, 'Postal code cannot exceed 20 characters']
    },
    country: {
      type: String,
      required: [true, 'Country code is required'],
      uppercase: true,
      trim: true,
      minlength: [2, 'Country code must be a 2-letter ISO code'],
      maxlength: [2, 'Country code must be a 2-letter ISO code']
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    },
    toObject: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Indexes
// 1. User listing and sorting (default address first, then newest)
addressSchema.index({ user: 1, isDefault: -1, createdAt: -1 });

// 2. Database-enforced uniqueness: at most one default address per customer
addressSchema.index(
  { user: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true }
  }
);

export const Address = mongoose.model('Address', addressSchema, 'addresses');

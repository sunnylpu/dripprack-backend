import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required']
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      max: [99, 'Quantity cannot exceed 99 units'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer'
      }
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required']
    },
    items: {
      type: [cartItemSchema],
      default: []
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

// One cart per customer
cartSchema.index({ user: 1 }, { unique: true });

// Prevent duplicate product entries in the same cart
cartSchema.pre('validate', function (next) {
  if (this.items && this.items.length > 0) {
    const productIds = new Set();
    for (const item of this.items) {
      const pIdStr = item.product.toString();
      if (productIds.has(pIdStr)) {
        return next(new Error(`Duplicate product ${pIdStr} in cart items array`));
      }
      productIds.add(pIdStr);
    }
  }
  next();
});

export const Cart = mongoose.model('Cart', cartSchema, 'carts');

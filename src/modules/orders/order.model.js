import mongoose from 'mongoose';
import { env } from '../../config/env.js';

const orderItemSnapshotSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required']
    },
    sku: {
      type: String,
      required: [true, 'Product SKU snapshot is required'],
      uppercase: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Product name snapshot is required'],
      trim: true
    },
    unitPriceCents: {
      type: Number,
      required: [true, 'Unit price in cents is required'],
      min: [0, 'Unit price cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Unit price must be an integer minor unit (cents)'
      }
    },
    quantity: {
      type: Number,
      required: [true, 'Item quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      max: [99, 'Quantity cannot exceed 99 units'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer'
      }
    },
    lineTotalCents: {
      type: Number,
      required: [true, 'Line total in cents is required'],
      min: [0, 'Line total cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Line total must be an integer minor unit (cents)'
      }
    }
  },
  { _id: true }
);

const shippingAddressSnapshotSchema = new mongoose.Schema(
  {
    recipientName: {
      type: String,
      required: [true, 'Recipient name is required'],
      trim: true,
      maxlength: 100
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: 25
    },
    streetAddress1: {
      type: String,
      required: [true, 'Street address line 1 is required'],
      trim: true,
      maxlength: 150
    },
    streetAddress2: {
      type: String,
      default: '',
      trim: true,
      maxlength: 150
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: 100
    },
    state: {
      type: String,
      required: [true, 'State / Province is required'],
      trim: true,
      maxlength: 100
    },
    postalCode: {
      type: String,
      required: [true, 'Postal code is required'],
      trim: true,
      maxlength: 20
    },
    country: {
      type: String,
      required: [true, 'Country code is required'],
      uppercase: true,
      trim: true,
      minlength: 2,
      maxlength: 2
    }
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderReference: {
      type: String,
      required: [true, 'Order reference is required'],
      uppercase: true,
      trim: true
    },
    idempotencyKey: {
      type: String,
      trim: true,
      default: null
    },
    idempotencyPayloadHash: {
      type: String,
      trim: true,
      default: null
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required']
    },
    items: {
      type: [orderItemSnapshotSchema],
      required: [true, 'Order items are required'],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'Order must contain at least one item'
      }
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      uppercase: true,
      default: env.CURRENCY_CODE
    },
    subtotalCents: {
      type: Number,
      required: [true, 'Subtotal in cents is required'],
      min: [0, 'Subtotal cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Subtotal must be an integer minor unit (cents)'
      }
    },
    shippingCents: {
      type: Number,
      required: [true, 'Shipping fee in cents is required'],
      min: [0, 'Shipping fee cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Shipping fee must be an integer minor unit (cents)'
      }
    },
    taxCents: {
      type: Number,
      required: [true, 'Tax in cents is required'],
      min: [0, 'Tax cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Tax must be an integer minor unit (cents)'
      }
    },
    totalCents: {
      type: Number,
      required: [true, 'Total amount in cents is required'],
      min: [0, 'Total cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Total must be an integer minor unit (cents)'
      }
    },
    shippingAddress: {
      type: shippingAddressSnapshotSchema,
      required: [true, 'Shipping address snapshot is required']
    },
    orderStatus: {
      type: String,
      required: [true, 'Order status is required'],
      enum: {
        values: [
          'awaiting_payment',
          'confirmed',
          'processing',
          'shipped',
          'delivered',
          'cancelled'
        ],
        message: '{VALUE} is not a valid order status'
      },
      default: 'awaiting_payment'
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['cod', 'online'],
        message: '{VALUE} is not a valid payment method'
      }
    },
    paymentStatus: {
      type: String,
      required: [true, 'Payment status is required'],
      enum: {
        values: ['pending', 'paid', 'failed', 'refunded', 'cod_due'],
        message: '{VALUE} is not a valid payment status'
      },
      default: 'pending'
    },
    isStockRestocked: {
      type: Boolean,
      required: true,
      default: false
    },
    tracking: {
      carrier: { type: String, default: null },
      trackingNumber: { type: String, default: null },
      trackingUrl: { type: String, default: null },
      dispatchedAt: { type: Date, default: null }
    },
    cancellation: {
      cancelledAt: { type: Date, default: null },
      cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      reason: { type: String, default: null }
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
orderSchema.index({ orderReference: 1 }, { unique: true });
orderSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });

export const Order = mongoose.model('Order', orderSchema, 'orders');

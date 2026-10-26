import mongoose from 'mongoose';
import { env } from '../../config/env.js';

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: [true, 'Order reference is required']
    },
    orderReference: {
      type: String,
      required: [true, 'Order reference code is required'],
      uppercase: true,
      trim: true
    },
    provider: {
      type: String,
      required: [true, 'Payment provider is required'],
      enum: {
        values: ['cod', 'stripe', 'mock'],
        message: '{VALUE} is not a valid payment provider'
      },
      default: 'cod'
    },
    providerPaymentId: {
      type: String,
      default: null,
      trim: true
    },
    amountCents: {
      type: Number,
      required: [true, 'Payment amount in cents is required'],
      min: [0, 'Payment amount cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Payment amount must be an integer minor unit (cents)'
      }
    },
    currency: {
      type: String,
      required: [true, 'Currency is required'],
      uppercase: true,
      default: env.CURRENCY_CODE
    },
    status: {
      type: String,
      required: [true, 'Payment status is required'],
      enum: {
        values: ['pending', 'paid', 'failed', 'refunded', 'cod_due'],
        message: '{VALUE} is not a valid payment status'
      },
      default: 'pending'
    },
    processedEvents: {
      type: [String],
      default: []
    },
    failureReason: {
      type: String,
      default: null
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
paymentSchema.index({ order: 1 });
paymentSchema.index({ orderReference: 1 });
paymentSchema.index({ providerPaymentId: 1 }, { sparse: true });
paymentSchema.index({ processedEvents: 1 });

export const Payment = mongoose.model('Payment', paymentSchema, 'payments');

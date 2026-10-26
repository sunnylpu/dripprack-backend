import mongoose from 'mongoose';

const inventoryMovementSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required']
    },
    sku: {
      type: String,
      required: [true, 'SKU snapshot is required'],
      uppercase: true,
      trim: true
    },
    movementType: {
      type: String,
      required: [true, 'Movement type is required'],
      enum: {
        values: ['adjustment', 'reservation', 'release', 'sale', 'restock'],
        message: '{VALUE} is not a valid movement type'
      }
    },
    quantityDelta: {
      type: Number,
      required: [true, 'Quantity delta is required'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity delta must be an integer'
      }
    },
    previousPhysical: {
      type: Number,
      required: [true, 'Previous physical stock is required'],
      min: [0, 'Previous physical stock cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Previous physical stock must be an integer'
      }
    },
    newPhysical: {
      type: Number,
      required: [true, 'New physical stock is required'],
      min: [0, 'New physical stock cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'New physical stock must be an integer'
      }
    },
    previousAvailable: {
      type: Number,
      required: [true, 'Previous available stock is required'],
      min: [0, 'Previous available stock cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Previous available stock must be an integer'
      }
    },
    newAvailable: {
      type: Number,
      required: [true, 'New available stock is required'],
      min: [0, 'New available stock cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'New available stock must be an integer'
      }
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Actor reference is required']
    },
    actorRole: {
      type: String,
      required: [true, 'Actor role is required'],
      enum: {
        values: ['admin', 'customer', 'system'],
        message: '{VALUE} is not a valid actor role'
      }
    },
    orderReference: {
      type: String,
      default: null,
      trim: true
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      minlength: [3, 'Reason must be at least 3 characters'],
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    idempotencyKey: {
      type: String,
      trim: true
    },
    idempotencyPayloadHash: {
      type: String
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
inventoryMovementSchema.index({ product: 1, createdAt: -1 });
inventoryMovementSchema.index({ movementType: 1, createdAt: -1 });
inventoryMovementSchema.index({ actor: 1, createdAt: -1 });
inventoryMovementSchema.index({ orderReference: 1 }, { sparse: true });
inventoryMovementSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: { idempotencyKey: { $type: 'string' } }
  }
);

export const InventoryMovement = mongoose.model(
  'InventoryMovement',
  inventoryMovementSchema,
  'inventory_movements'
);

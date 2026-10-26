import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      uppercase: true,
      trim: true
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      lowercase: true,
      trim: true
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters']
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
      maxlength: [5000, 'Product description cannot exceed 5000 characters']
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category reference is required']
    },
    priceCents: {
      type: Number,
      required: [true, 'Price in cents is required'],
      min: [0, 'Price must be a non-negative integer'],
      validate: {
        validator: Number.isInteger,
        message: 'Price must be an integer minor unit (cents)'
      }
    },
    compareAtPriceCents: {
      type: Number,
      default: null,
      min: [0, 'Compare-at price must be a non-negative integer'],
      validate: {
        validator: (v) => v === null || Number.isInteger(v),
        message: 'Compare-at price must be an integer minor unit (cents)'
      }
    },
    images: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: {
        values: ['draft', 'published', 'archived'],
        message: '{VALUE} is not a valid product status'
      },
      default: 'draft'
    },
    stock: {
      physical: {
        type: Number,
        default: 0,
        min: [0, 'Physical stock cannot be negative'],
        validate: {
          validator: Number.isInteger,
          message: 'Physical stock must be an integer'
        }
      },
      reserved: {
        type: Number,
        default: 0,
        min: [0, 'Reserved stock cannot be negative'],
        validate: {
          validator: Number.isInteger,
          message: 'Reserved stock must be an integer'
        }
      },
      available: {
        type: Number,
        default: 0,
        min: [0, 'Available stock cannot be negative'],
        validate: {
          validator: Number.isInteger,
          message: 'Available stock must be an integer'
        }
      }
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: [0, 'Low stock threshold cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'Low stock threshold must be an integer'
      }
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

// Consistency validation hook
productSchema.pre('validate', function (next) {
  if (this.stock) {
    if (this.stock.reserved > this.stock.physical) {
      this.invalidate('stock.reserved', 'Reserved stock cannot exceed physical stock');
    }
    if (this.stock.available !== this.stock.physical - this.stock.reserved) {
      this.invalidate('stock.available', 'Available stock must equal physical stock minus reserved stock');
    }
  }
  next();
});

// Indexes
productSchema.index({ sku: 1 }, { unique: true });
productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ status: 1, category: 1, 'stock.available': 1 });
productSchema.index({ 'stock.available': 1 });
productSchema.index({ category: 1 });
productSchema.index({ name: 'text', description: 'text' });

export const Product = mongoose.model('Product', productSchema);

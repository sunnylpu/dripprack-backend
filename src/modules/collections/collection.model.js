import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Collection title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters']
    },
    slug: {
      type: String,
      required: [true, 'Collection slug is required'],
      lowercase: true,
      trim: true,
      unique: true
    },
    type: {
      type: String,
      enum: {
        values: ['DROP', 'CURATION', 'CORE', 'COLLABORATION'],
        message: '{VALUE} is not a valid collection type'
      },
      default: 'CURATION'
    },
    heroHeading: {
      type: String,
      trim: true,
      default: null,
      maxlength: [200, 'Hero heading cannot exceed 200 characters']
    },
    heroSubheading: {
      type: String,
      trim: true,
      default: null,
      maxlength: [300, 'Hero subheading cannot exceed 300 characters']
    },
    bannerImageUrl: {
      type: String,
      trim: true,
      default: null
    },
    description: {
      type: String,
      trim: true,
      default: null,
      maxlength: [2000, 'Description cannot exceed 2000 characters']
    },
    season: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, 'Season cannot exceed 50 characters']
    },
    isFeaturedOnHome: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    sortOrder: {
      type: Number,
      default: 0
    },
    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      }
    ]
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

collectionSchema.index({ isActive: 1, sortOrder: 1 });
collectionSchema.index({ isFeaturedOnHome: 1 });

export const Collection = mongoose.model('Collection', collectionSchema);

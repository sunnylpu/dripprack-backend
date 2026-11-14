import mongoose from 'mongoose';

const storefrontSectionSchema = new mongoose.Schema(
  {
    sectionKey: {
      type: String,
      required: [true, 'Section key is required'],
      unique: true,
      trim: true,
      lowercase: true
    },
    sectionName: {
      type: String,
      required: [true, 'Section name is required'],
      trim: true
    },
    sectionType: {
      type: String,
      required: [true, 'Section type is required'],
      enum: [
        'HERO_VIDEO',
        'VIDEO_BANNER',
        'SHOP_THE_LOOK',
        'PRODUCT_FEED',
        'CAROUSEL',
        'CATEGORY_GRID',
        'IMAGE_BANNER',
        'NEWSLETTER'
      ]
    },
    page: {
      type: String,
      default: 'home',
      enum: ['home', 'shop', 'about', 'support']
    },
    sortOrder: {
      type: Number,
      required: true,
      default: 1
    },
    placementNotice: {
      type: String,
      required: [true, 'Placement notice is required'],
      trim: true
    },
    media: {
      videoUrl: { type: String, default: null, trim: true },
      posterUrl: { type: String, default: null, trim: true },
      imageUrl: { type: String, default: null, trim: true },
      secondaryImageUrl: { type: String, default: null, trim: true }
    },
    content: {
      heading: { type: String, default: null, trim: true },
      subheading: { type: String, default: null, trim: true },
      caption: { type: String, default: null, trim: true },
      badge: { type: String, default: null, trim: true }
    },
    cta: {
      text: { type: String, default: null, trim: true },
      link: { type: String, default: null, trim: true },
      style: {
        type: String,
        enum: ['white', 'black', 'outline'],
        default: 'white'
      }
    },
    curation: {
      category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
      },
      products: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Product'
        }
      ],
      modelSpecs: { type: String, default: null, trim: true }
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

storefrontSectionSchema.index({ page: 1, sortOrder: 1 });
storefrontSectionSchema.index({ isActive: 1 });

export const StorefrontSection = mongoose.model('StorefrontSection', storefrontSectionSchema);


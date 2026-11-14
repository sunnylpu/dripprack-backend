import mongoose from 'mongoose';

const galleryItemSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, 'Gallery item image URL is required'],
      trim: true
    },
    layout: {
      type: String,
      enum: ['FULL_BLEED', 'TWO_UP_LEFT', 'TWO_UP_RIGHT', 'MOSAIC'],
      default: 'FULL_BLEED'
    },
    caption: {
      type: String,
      trim: true,
      default: null,
      maxlength: [300, 'Caption cannot exceed 300 characters']
    }
  },
  { _id: true }
);

const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Project title is required'],
      trim: true,
      maxlength: [150, 'Title cannot exceed 150 characters']
    },
    slug: {
      type: String,
      required: [true, 'Project slug is required'],
      lowercase: true,
      trim: true,
      unique: true
    },
    season: {
      type: String,
      trim: true,
      default: null,
      maxlength: [50, 'Season cannot exceed 50 characters']
    },
    year: {
      type: Number,
      default: () => new Date().getFullYear()
    },
    statement: {
      type: String,
      trim: true,
      default: null,
      maxlength: [3000, 'Statement cannot exceed 3000 characters']
    },
    heroMediaUrl: {
      type: String,
      trim: true,
      default: null
    },
    gallery: {
      type: [galleryItemSchema],
      default: []
    },
    taggedProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
      }
    ],
    isPublished: {
      type: Boolean,
      default: true
    },
    publishedAt: {
      type: Date,
      default: Date.now
    },
    sortOrder: {
      type: Number,
      default: 0
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

projectSchema.index({ isPublished: 1, sortOrder: 1 });

export const Project = mongoose.model('Project', projectSchema);

import { Collection } from './collection.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { slugify } from '../../utils/slugify.js';

export const collectionService = {
  /**
   * Get active collections for public storefront (Mega-Menu, Homepage, Filters)
   */
  async getPublicCollections(query = {}) {
    const filter = { isActive: true };
    if (query.featured === 'true') {
      filter.isFeaturedOnHome = true;
    }
    if (query.type) {
      filter.type = query.type.toUpperCase();
    }

    const collections = await Collection.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .populate({
        path: 'products',
        match: { status: 'published' },
        select: 'sku slug name priceCents compareAtPriceCents images secondaryHoverImage attributes badge subtitle stock.available'
      });

    return collections;
  },

  /**
   * Get single collection by slug for public collection catalog view
   */
  async getPublicCollectionBySlug(slug) {
    const collection = await Collection.findOne({
      slug: slug.toLowerCase(),
      isActive: true
    }).populate({
      path: 'products',
      match: { status: 'published' },
      select: 'sku slug name priceCents compareAtPriceCents images secondaryHoverImage attributes badge subtitle stock.available category',
      populate: {
        path: 'category',
        select: 'name slug'
      }
    });

    if (!collection) {
      throw ApiError.notFound('Collection not found or currently unavailable');
    }

    return collection;
  },

  /**
   * Admin: Get all collections
   */
  async getAdminCollections() {
    return Collection.find()
      .sort({ sortOrder: 1, createdAt: -1 })
      .populate('products', 'sku name status priceCents');
  },

  /**
   * Admin: Create new collection
   */
  async createCollection(data) {
    const slug = data.slug || slugify(data.title);

    const existing = await Collection.findOne({ slug });
    if (existing) {
      throw ApiError.conflict(`Collection with slug "${slug}" already exists`);
    }

    const collection = await Collection.create({
      ...data,
      slug
    });

    return collection;
  },

  /**
   * Admin: Update collection
   */
  async updateCollection(id, data) {
    if (data.slug) {
      const existing = await Collection.findOne({ slug: data.slug, _id: { $ne: id } });
      if (existing) {
        throw ApiError.conflict(`Collection with slug "${data.slug}" already exists`);
      }
    }

    const collection = await Collection.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!collection) {
      throw ApiError.notFound('Collection not found');
    }

    return collection;
  },

  /**
   * Admin: Delete collection
   */
  async deleteCollection(id) {
    const collection = await Collection.findByIdAndDelete(id);
    if (!collection) {
      throw ApiError.notFound('Collection not found');
    }
    return collection;
  }
};


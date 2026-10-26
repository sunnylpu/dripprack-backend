import { Product } from './product.model.js';
import { Category } from '../categories/category.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { slugify } from '../../utils/slugify.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { getPaginationParams, formatPaginatedResult } from '../../utils/pagination.js';

function parseSortBy(sortByString = 'createdAt:desc') {
  const [field, direction] = sortByString.split(':');
  const sortOrder = direction === 'asc' ? 1 : -1;
  return { [field]: sortOrder };
}

export const productService = {
  /**
   * Get public listing of published products in active categories
   */
  async getPublicProducts(query) {
    const { page, limit, skip } = getPaginationParams(query);

    // 1. Fetch all active categories to guarantee products in inactive categories are never visible
    const activeCategories = await Category.find({ isActive: true }).select('_id slug');
    const activeCategoryIds = activeCategories.map((c) => c._id);

    // If no active categories exist in the store, return empty immediately
    if (activeCategoryIds.length === 0) {
      return formatPaginatedResult({ data: [], total: 0, page, limit });
    }

    const filter = {
      status: 'published',
      category: { $in: activeCategoryIds }
    };

    // 2. Specific category filter (by ID or slug)
    if (query.category) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(query.category);
      const matchedCategory = activeCategories.find((c) =>
        isObjectId ? c._id.toString() === query.category : c.slug === query.category.toLowerCase()
      );

      if (!matchedCategory) {
        // Specified category is either inactive or does not exist
        return formatPaginatedResult({ data: [], total: 0, page, limit });
      }

      filter.category = matchedCategory._id;
    }

    // 3. Search query (safe regex on name or description)
    if (query.q) {
      const escaped = escapeRegex(query.q);
      filter.$or = [
        { name: new RegExp(escaped, 'i') },
        { description: new RegExp(escaped, 'i') }
      ];
    }

    // 4. Availability filter
    if (query.inStock === 'true') {
      filter['stock.available'] = { $gt: 0 };
    } else if (query.inStock === 'false') {
      filter['stock.available'] = 0;
    }

    // 5. Allowlisted sorting
    const sort = parseSortBy(query.sortBy);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter)
    ]);

    return formatPaginatedResult({ data: products, total, page, limit });
  },

  /**
   * Get single published product by ID or Slug for public storefront
   */
  async getPublicProductByIdOrSlug(idOrSlug) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
    const lookup = isObjectId ? { _id: idOrSlug } : { slug: idOrSlug.toLowerCase() };

    const product = await Product.findOne({
      ...lookup,
      status: 'published'
    }).populate('category', 'name slug isActive');

    // Must be found, published, and category must exist and be active
    if (!product || !product.category || !product.category.isActive) {
      throw ApiError.notFound('Product not found or currently unavailable');
    }

    return product;
  },

  /**
   * Get all products for admin (including drafts & archived)
   */
  async getAdminProducts(query) {
    const { page, limit, skip } = getPaginationParams(query);
    const filter = {};

    // Filter by status if requested
    if (query.status) {
      filter.status = query.status;
    }

    // Filter by category if requested (by ID or slug)
    if (query.category) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(query.category);
      if (isObjectId) {
        filter.category = query.category;
      } else {
        const cat = await Category.findOne({ slug: query.category.toLowerCase() });
        if (cat) {
          filter.category = cat._id;
        } else {
          return formatPaginatedResult({ data: [], total: 0, page, limit });
        }
      }
    }

    // Search query (name, description, or SKU)
    if (query.q) {
      const escaped = escapeRegex(query.q);
      filter.$or = [
        { name: new RegExp(escaped, 'i') },
        { description: new RegExp(escaped, 'i') },
        { sku: new RegExp(escaped, 'i') }
      ];
    }

    // Availability filter
    if (query.inStock === 'true') {
      filter['stock.available'] = { $gt: 0 };
    } else if (query.inStock === 'false') {
      filter['stock.available'] = 0;
    }

    const sort = parseSortBy(query.sortBy);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug isActive')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(filter)
    ]);

    return formatPaginatedResult({ data: products, total, page, limit });
  },

  /**
   * Get product by ID for admin (regardless of status or category state)
   */
  async getAdminProductById(id) {
    const product = await Product.findById(id).populate('category', 'name slug isActive');
    if (!product) {
      throw ApiError.notFound('Product not found');
    }
    return product;
  },

  /**
   * Create a new product (Admin only)
   * INVENTORY RULE: Initial stock is always zero.
   */
  async createProduct(data) {
    // 1. Verify category exists and is active
    const category = await Category.findById(data.category);
    if (!category) {
      throw ApiError.badRequest('Referenced category does not exist');
    }
    if (!category.isActive) {
      throw ApiError.badRequest('Cannot assign product to an inactive category');
    }

    // 2. Validate SKU uniqueness
    const normalizedSku = data.sku.trim().toUpperCase();
    const existingSku = await Product.findOne({ sku: normalizedSku });
    if (existingSku) {
      throw ApiError.conflict('A product with this SKU already exists', [
        { field: 'sku', message: 'SKU must be unique' }
      ]);
    }

    // 3. Generate and validate slug uniqueness
    const finalSlug = data.slug ? slugify(data.slug) : slugify(data.name);
    if (!finalSlug) {
      throw ApiError.badRequest('Product name must contain alphanumeric characters for slug generation');
    }

    const existingSlug = await Product.findOne({ slug: finalSlug });
    if (existingSlug) {
      throw ApiError.conflict('A product with this slug already exists', [
        { field: 'slug', message: 'Product slug must be unique' }
      ]);
    }

    // 4. Force default inventory to zero (stock cannot be set on creation)
    const product = await Product.create({
      sku: normalizedSku,
      slug: finalSlug,
      name: data.name.trim(),
      description: data.description.trim(),
      category: category._id,
      priceCents: data.priceCents,
      compareAtPriceCents: data.compareAtPriceCents ?? null,
      images: Array.isArray(data.images) ? data.images : [],
      status: data.status || 'draft',
      stock: {
        physical: 0,
        reserved: 0,
        available: 0
      },
      lowStockThreshold: data.lowStockThreshold ?? 5
    });

    return product.populate('category', 'name slug');
  },

  /**
   * Update catalog fields (Admin only)
   * INVENTORY RULE: General updates cannot modify stock fields.
   */
  async updateProduct(id, updateData) {
    const product = await Product.findById(id);
    if (!product) {
      throw ApiError.notFound('Product not found');
    }

    // Category update check
    if (updateData.category && updateData.category !== product.category.toString()) {
      const category = await Category.findById(updateData.category);
      if (!category) {
        throw ApiError.badRequest('Referenced category does not exist');
      }
      if (!category.isActive) {
        throw ApiError.badRequest('Cannot assign product to an inactive category');
      }
      product.category = category._id;
    }

    // SKU update check
    if (updateData.sku && updateData.sku.trim().toUpperCase() !== product.sku) {
      const newSku = updateData.sku.trim().toUpperCase();
      const existing = await Product.findOne({ _id: { $ne: id }, sku: newSku });
      if (existing) {
        throw ApiError.conflict('Another product with this SKU already exists', [
          { field: 'sku', message: 'SKU must be unique' }
        ]);
      }
      product.sku = newSku;
    }

    // Slug update check
    if (updateData.slug || updateData.name) {
      let targetSlug = updateData.slug ? slugify(updateData.slug) : undefined;
      if (!targetSlug && updateData.name && updateData.name.trim() !== product.name) {
        targetSlug = slugify(updateData.name);
      }

      if (targetSlug && targetSlug !== product.slug) {
        const existing = await Product.findOne({ _id: { $ne: id }, slug: targetSlug });
        if (existing) {
          throw ApiError.conflict('Another product with this slug already exists', [
            { field: 'slug', message: 'Product slug must be unique' }
          ]);
        }
        product.slug = targetSlug;
      }
    }

    if (updateData.name !== undefined) product.name = updateData.name.trim();
    if (updateData.description !== undefined) product.description = updateData.description.trim();
    if (updateData.priceCents !== undefined) product.priceCents = updateData.priceCents;
    if (updateData.compareAtPriceCents !== undefined) product.compareAtPriceCents = updateData.compareAtPriceCents;
    if (updateData.images !== undefined) product.images = updateData.images;
    if (updateData.lowStockThreshold !== undefined) product.lowStockThreshold = updateData.lowStockThreshold;

    // Notice: Any updateData.stock fields are deliberately NOT assigned!

    await product.save();
    return product.populate('category', 'name slug');
  },

  /**
   * Update product status (Admin only)
   */
  async updateProductStatus(id, newStatus) {
    const product = await Product.findById(id);
    if (!product) {
      throw ApiError.notFound('Product not found');
    }

    // If publishing, ensure category exists and is active
    if (newStatus === 'published') {
      const category = await Category.findById(product.category);
      if (!category || !category.isActive) {
        throw ApiError.conflict('Cannot publish product whose category is inactive or missing');
      }
    }

    product.status = newStatus;
    await product.save();

    return product.populate('category', 'name slug isActive');
  }
};

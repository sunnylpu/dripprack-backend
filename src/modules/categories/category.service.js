import { Category } from './category.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { slugify } from '../../utils/slugify.js';
import { escapeRegex } from '../../utils/escapeRegex.js';
import { getPaginationParams, formatPaginatedResult } from '../../utils/pagination.js';

export const categoryService = {
  /**
   * Get all active categories for public storefront
   */
  async getActiveCategories() {
    return Category.find({ isActive: true }).sort({ name: 1 });
  },

  /**
   * Get all categories for administration (including inactive if requested)
   */
  async getAdminCategories(query) {
    const { page, limit, skip } = getPaginationParams(query);
    const filter = {};

    if (!query.includeInactive) {
      filter.isActive = true;
    }

    const [categories, total] = await Promise.all([
      Category.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Category.countDocuments(filter)
    ]);

    return formatPaginatedResult({ data: categories, total, page, limit });
  },

  /**
   * Get single category by ID
   * @param {string} id - Category ObjectId
   * @param {object} [options]
   * @param {boolean} [options.onlyActive=false] - If true, throws 404 if category is inactive
   */
  async getCategoryById(id, { onlyActive = false } = {}) {
    const category = await Category.findById(id);
    if (!category || (onlyActive && !category.isActive)) {
      throw ApiError.notFound('Category not found');
    }
    return category;
  },

  /**
   * Create a new category (Admin only)
   */
  async createCategory({ name, slug, description, isActive }) {
    const trimmedName = name.trim();
    const finalSlug = slug ? slug.trim().toLowerCase() : slugify(trimmedName);

    if (!finalSlug) {
      throw ApiError.badRequest('Category name must contain alphanumeric characters for slug generation');
    }

    // Check collision on name or slug
    const existing = await Category.findOne({
      $or: [
        { name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i') },
        { slug: finalSlug }
      ]
    });

    if (existing) {
      const field = existing.slug === finalSlug ? 'slug' : 'name';
      throw ApiError.conflict(`A category with this ${field} already exists`, [
        { field, message: `Category ${field} must be unique` }
      ]);
    }

    const category = await Category.create({
      name: trimmedName,
      slug: finalSlug,
      description: description?.trim() || '',
      isActive: typeof isActive === 'boolean' ? isActive : true
    });

    return category;
  },

  /**
   * Update category details (Admin only)
   */
  async updateCategory(id, updateData) {
    const category = await Category.findById(id);
    if (!category) {
      throw ApiError.notFound('Category not found');
    }

    const checkOrConditions = [];

    if (updateData.name && updateData.name.trim() !== category.name) {
      updateData.name = updateData.name.trim();
      checkOrConditions.push({ name: new RegExp(`^${escapeRegex(updateData.name)}$`, 'i') });
    }

    if (updateData.slug && updateData.slug.trim().toLowerCase() !== category.slug) {
      updateData.slug = updateData.slug.trim().toLowerCase();
      checkOrConditions.push({ slug: updateData.slug });
    }

    // Collision check against other categories
    if (checkOrConditions.length > 0) {
      const existing = await Category.findOne({
        _id: { $ne: id },
        $or: checkOrConditions
      });

      if (existing) {
        const field = existing.slug === updateData.slug ? 'slug' : 'name';
        throw ApiError.conflict(`Another category with this ${field} already exists`, [
          { field, message: `Category ${field} must be unique` }
        ]);
      }
    }

    if (updateData.name !== undefined) category.name = updateData.name;
    if (updateData.slug !== undefined) category.slug = updateData.slug;
    if (updateData.description !== undefined) category.description = updateData.description.trim();
    if (updateData.isActive !== undefined) category.isActive = updateData.isActive;

    await category.save();
    return category;
  },

  /**
   * Deactivate a category (Soft delete / isActive = false)
   */
  async deactivateCategory(id) {
    const category = await Category.findById(id);
    if (!category) {
      throw ApiError.notFound('Category not found');
    }

    category.isActive = false;
    await category.save();

    return category;
  }
};

import { categoryService } from './category.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const categoryController = {
  /**
   * Get public active categories
   */
  getActiveCategories: asyncHandler(async (req, res) => {
    const categories = await categoryService.getActiveCategories();
    return ApiResponse.success(res, {
      message: 'Active categories retrieved successfully',
      data: { categories }
    });
  }),

  /**
   * Get all categories for admin (paginated, supports inactive)
   */
  getAdminCategories: asyncHandler(async (req, res) => {
    const result = await categoryService.getAdminCategories(req.query);
    return ApiResponse.success(res, {
      message: 'Admin categories retrieved successfully',
      data: { categories: result.data },
      meta: result.meta
    });
  }),

  /**
   * Get single category by ID
   */
  getCategoryById: asyncHandler(async (req, res) => {
    const category = await categoryService.getCategoryById(req.params.id);
    return ApiResponse.success(res, {
      message: 'Category retrieved successfully',
      data: { category }
    });
  }),

  /**
   * Create new category (Admin only)
   */
  createCategory: asyncHandler(async (req, res) => {
    const category = await categoryService.createCategory(req.body);
    return ApiResponse.created(res, {
      message: 'Category created successfully',
      data: { category }
    });
  }),

  /**
   * Update category (Admin only)
   */
  updateCategory: asyncHandler(async (req, res) => {
    const category = await categoryService.updateCategory(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: 'Category updated successfully',
      data: { category }
    });
  }),

  /**
   * Deactivate category (Admin only - soft delete)
   */
  deactivateCategory: asyncHandler(async (req, res) => {
    const category = await categoryService.deactivateCategory(req.params.id);
    return ApiResponse.success(res, {
      message: 'Category deactivated successfully',
      data: { category }
    });
  })
};

import { sectionService } from './section.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const sectionController = {
  /**
   * Get storefront sections (filtered by page or active status)
   */
  getSections: asyncHandler(async (req, res) => {
    const sections = await sectionService.getSections(req.query);
    return ApiResponse.success(res, {
      message: 'Storefront sections retrieved successfully',
      data: { sections }
    });
  }),

  /**
   * Get single section by unique sectionKey
   */
  getSectionByKey: asyncHandler(async (req, res) => {
    const section = await sectionService.getSectionByKey(req.params.key);
    return ApiResponse.success(res, {
      message: 'Storefront section retrieved successfully',
      data: { section }
    });
  }),

  /**
   * Get single section by ID
   */
  getSectionById: asyncHandler(async (req, res) => {
    const section = await sectionService.getSectionById(req.params.id);
    return ApiResponse.success(res, {
      message: 'Storefront section retrieved successfully',
      data: { section }
    });
  }),

  /**
   * Create new section (Admin only)
   */
  createSection: asyncHandler(async (req, res) => {
    const section = await sectionService.createSection(req.body);
    return ApiResponse.created(res, {
      message: 'Storefront section created successfully',
      data: { section }
    });
  }),

  /**
   * Update section (Admin only)
   */
  updateSection: asyncHandler(async (req, res) => {
    const section = await sectionService.updateSection(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: 'Storefront section updated successfully',
      data: { section }
    });
  }),

  /**
   * Toggle section active status (Admin only)
   */
  toggleSectionStatus: asyncHandler(async (req, res) => {
    const section = await sectionService.toggleSectionStatus(req.params.id, req.body?.isActive);
    return ApiResponse.success(res, {
      message: 'Storefront section status updated successfully',
      data: { section }
    });
  }),

  /**
   * Delete section (Admin only)
   */
  deleteSection: asyncHandler(async (req, res) => {
    const result = await sectionService.deleteSection(req.params.id);
    return ApiResponse.success(res, {
      message: 'Storefront section deleted successfully',
      data: result
    });
  })
};


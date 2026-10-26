import { productService } from './product.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const productController = {
  /**
   * Get public paginated product listing
   */
  getPublicProducts: asyncHandler(async (req, res) => {
    const result = await productService.getPublicProducts(req.query);
    return ApiResponse.success(res, {
      message: 'Published products retrieved successfully',
      data: { products: result.data },
      meta: result.meta
    });
  }),

  /**
   * Get single published product by ID or Slug
   */
  getPublicProductByIdOrSlug: asyncHandler(async (req, res) => {
    const product = await productService.getPublicProductByIdOrSlug(req.params.idOrSlug);
    return ApiResponse.success(res, {
      message: 'Product retrieved successfully',
      data: { product }
    });
  }),

  /**
   * Get all products for administrator
   */
  getAdminProducts: asyncHandler(async (req, res) => {
    const result = await productService.getAdminProducts(req.query);
    return ApiResponse.success(res, {
      message: 'Admin products retrieved successfully',
      data: { products: result.data },
      meta: result.meta
    });
  }),

  /**
   * Get single product for administrator by ID
   */
  getAdminProductById: asyncHandler(async (req, res) => {
    const product = await productService.getAdminProductById(req.params.id);
    return ApiResponse.success(res, {
      message: 'Product retrieved successfully',
      data: { product }
    });
  }),

  /**
   * Create product (Admin only)
   */
  createProduct: asyncHandler(async (req, res) => {
    const product = await productService.createProduct(req.body);
    return ApiResponse.created(res, {
      message: 'Product created successfully',
      data: { product }
    });
  }),

  /**
   * Update product catalog fields (Admin only)
   */
  updateProduct: asyncHandler(async (req, res) => {
    const product = await productService.updateProduct(req.params.id, req.body);
    return ApiResponse.success(res, {
      message: 'Product updated successfully',
      data: { product }
    });
  }),

  /**
   * Update product status (Admin only)
   */
  updateProductStatus: asyncHandler(async (req, res) => {
    const product = await productService.updateProductStatus(req.params.id, req.body.status);
    return ApiResponse.success(res, {
      message: `Product status updated to ${req.body.status}`,
      data: { product }
    });
  })
};

import { addressService } from './address.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const addressController = {
  /**
   * Get all delivery addresses owned by the authenticated customer
   * GET /api/v1/addresses
   */
  getAddresses: asyncHandler(async (req, res) => {
    const addresses = await addressService.getUserAddresses(req.user._id);
    return ApiResponse.success(res, {
      message: 'Delivery addresses retrieved successfully',
      data: { addresses }
    });
  }),

  /**
   * Create a new delivery address
   * POST /api/v1/addresses
   */
  createAddress: asyncHandler(async (req, res) => {
    const address = await addressService.createAddress(req.user._id, req.body);
    return ApiResponse.created(res, {
      message: 'Delivery address created successfully',
      data: { address }
    });
  }),

  /**
   * Update an owned delivery address
   * PATCH /api/v1/addresses/:id
   */
  updateAddress: asyncHandler(async (req, res) => {
    const address = await addressService.updateAddress({
      userId: req.user._id,
      addressId: req.params.id,
      updateData: req.body
    });

    return ApiResponse.success(res, {
      message: 'Delivery address updated successfully',
      data: { address }
    });
  }),

  /**
   * Set specific owned address as the default
   * PATCH /api/v1/addresses/:id/default
   */
  setDefaultAddress: asyncHandler(async (req, res) => {
    const address = await addressService.setDefaultAddress({
      userId: req.user._id,
      addressId: req.params.id
    });

    return ApiResponse.success(res, {
      message: 'Default delivery address updated successfully',
      data: { address }
    });
  }),

  /**
   * Delete an owned delivery address
   * DELETE /api/v1/addresses/:id
   */
  deleteAddress: asyncHandler(async (req, res) => {
    const result = await addressService.deleteAddress({
      userId: req.user._id,
      addressId: req.params.id
    });

    return ApiResponse.success(res, {
      message: 'Delivery address deleted successfully',
      data: result
    });
  })
};

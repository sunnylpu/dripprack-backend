import { adminService } from './admin.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const adminController = {
  /**
   * List all orders across customers with filters and pagination
   */
  getOrders: asyncHandler(async (req, res) => {
    const result = await adminService.getAdminOrders(req.query);
    return ApiResponse.success(res, {
      message: 'Orders retrieved successfully',
      data: { orders: result.data },
      meta: result.meta
    });
  }),

  /**
   * Retrieve order details by reference with customer summary, payment, and audit history
   */
  getOrderByReference: asyncHandler(async (req, res) => {
    const data = await adminService.getAdminOrderByReference(req.params.reference);
    return ApiResponse.success(res, {
      message: 'Order details retrieved successfully',
      data
    });
  }),

  /**
   * Update order fulfillment status with state machine checks and tracking validation
   */
  updateOrderStatus: asyncHandler(async (req, res) => {
    const data = await adminService.updateOrderStatus(req.user._id, req.params.reference, {
      status: req.body.status,
      tracking: req.body.tracking,
      codPaymentCollected: req.body.codPaymentCollected,
      ipAddress: req.ip || req.connection?.remoteAddress || null
    });

    return ApiResponse.success(res, {
      message: data.isNoop
        ? 'Order is already in requested status'
        : `Order status successfully transitioned to ${req.body.status}`,
      data
    });
  }),

  /**
   * Cancel an eligible order by administrator with exactly-once inventory release
   */
  cancelOrder: asyncHandler(async (req, res) => {
    const data = await adminService.cancelOrderByAdmin(req.user._id, req.params.reference, {
      reason: req.body?.reason,
      ipAddress: req.ip || req.connection?.remoteAddress || null
    });

    return ApiResponse.success(res, {
      message: 'Order cancelled successfully by administrator',
      data
    });
  }),

  /**
   * Retrieve aggregated admin dashboard metrics
   */
  getDashboardSummary: asyncHandler(async (req, res) => {
    const data = await adminService.getDashboardSummary();
    return ApiResponse.success(res, {
      message: 'Dashboard summary retrieved successfully',
      data
    });
  }),

  /**
   * Retrieve append-only administrative audit logs with pagination and filters
   */
  getAuditLogs: asyncHandler(async (req, res) => {
    const result = await adminService.getAuditLogs(req.query);
    return ApiResponse.success(res, {
      message: 'Audit logs retrieved successfully',
      data: { auditLogs: result.data },
      meta: result.meta
    });
  })
};

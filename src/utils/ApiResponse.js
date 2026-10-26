/**
 * Standard API JSON Response Helper
 */
export class ApiResponse {
  /**
   * Send a successful JSON response
   */
  static success(res, { data = null, message = 'Success', statusCode = 200, meta = null } = {}) {
    const payload = {
      success: true,
      statusCode,
      message,
      data
    };

    if (meta) {
      payload.meta = meta;
    }

    return res.status(statusCode).json(payload);
  }

  /**
   * Send a 201 Created response
   */
  static created(res, { data = null, message = 'Resource created successfully', meta = null } = {}) {
    return ApiResponse.success(res, { data, message, statusCode: 201, meta });
  }

  /**
   * Send a 204 No Content response
   */
  static noContent(res) {
    return res.status(204).send();
  }
}

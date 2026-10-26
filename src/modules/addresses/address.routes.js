import { Router } from 'express';
import { addressController } from './address.controller.js';
import {
  createAddressSchema,
  updateAddressSchema,
  addressIdParamsSchema
} from './address.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Address operations strictly require authenticated customer
router.use(authenticate, authorize('customer'));

// GET /api/v1/addresses - List all owned addresses
router.get('/', addressController.getAddresses);

// POST /api/v1/addresses - Create a new address
router.post('/', validateRequest(createAddressSchema), addressController.createAddress);

// PATCH /api/v1/addresses/:id - Update an address
router.patch('/:id', validateRequest(updateAddressSchema), addressController.updateAddress);

// PATCH /api/v1/addresses/:id/default - Set as default delivery address
router.patch('/:id/default', validateRequest(addressIdParamsSchema), addressController.setDefaultAddress);

// DELETE /api/v1/addresses/:id - Delete an address
router.delete('/:id', validateRequest(addressIdParamsSchema), addressController.deleteAddress);

export default router;

import { collectionService } from './collection.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';

export const collectionController = {
  async getPublicCollections(req, res, next) {
    try {
      const collections = await collectionService.getPublicCollections(req.query);
      return ApiResponse.success(res, {
        message: 'Collections retrieved successfully',
        data: collections
      });
    } catch (err) {
      next(err);
    }
  },

  async getPublicCollectionBySlug(req, res, next) {
    try {
      const collection = await collectionService.getPublicCollectionBySlug(req.params.slug);
      return ApiResponse.success(res, {
        message: 'Collection retrieved successfully',
        data: collection
      });
    } catch (err) {
      next(err);
    }
  },

  async getAdminCollections(req, res, next) {
    try {
      const collections = await collectionService.getAdminCollections();
      return ApiResponse.success(res, {
        message: 'All collections retrieved successfully',
        data: collections
      });
    } catch (err) {
      next(err);
    }
  },

  async createCollection(req, res, next) {
    try {
      const collection = await collectionService.createCollection(req.body);
      return ApiResponse.created(res, {
        message: 'Collection created successfully',
        data: collection
      });
    } catch (err) {
      next(err);
    }
  },

  async updateCollection(req, res, next) {
    try {
      const collection = await collectionService.updateCollection(req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Collection updated successfully',
        data: collection
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteCollection(req, res, next) {
    try {
      await collectionService.deleteCollection(req.params.id);
      return ApiResponse.success(res, {
        message: 'Collection deleted successfully',
        data: null
      });
    } catch (err) {
      next(err);
    }
  }
};


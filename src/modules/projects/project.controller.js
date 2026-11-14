import { projectService } from './project.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';

export const projectController = {
  async getPublicProjects(req, res, next) {
    try {
      const projects = await projectService.getPublicProjects();
      return ApiResponse.success(res, {
        message: 'Projects retrieved successfully',
        data: projects
      });
    } catch (err) {
      next(err);
    }
  },

  async getPublicProjectBySlug(req, res, next) {
    try {
      const project = await projectService.getPublicProjectBySlug(req.params.slug);
      return ApiResponse.success(res, {
        message: 'Project retrieved successfully',
        data: project
      });
    } catch (err) {
      next(err);
    }
  },

  async getAdminProjects(req, res, next) {
    try {
      const projects = await projectService.getAdminProjects();
      return ApiResponse.success(res, {
        message: 'All projects retrieved successfully',
        data: projects
      });
    } catch (err) {
      next(err);
    }
  },

  async createProject(req, res, next) {
    try {
      const project = await projectService.createProject(req.body);
      return ApiResponse.created(res, {
        message: 'Project created successfully',
        data: project
      });
    } catch (err) {
      next(err);
    }
  },

  async updateProject(req, res, next) {
    try {
      const project = await projectService.updateProject(req.params.id, req.body);
      return ApiResponse.success(res, {
        message: 'Project updated successfully',
        data: project
      });
    } catch (err) {
      next(err);
    }
  },

  async deleteProject(req, res, next) {
    try {
      await projectService.deleteProject(req.params.id);
      return ApiResponse.success(res, {
        message: 'Project deleted successfully',
        data: null
      });
    } catch (err) {
      next(err);
    }
  }
};


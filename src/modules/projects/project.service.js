import { Project } from './project.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { slugify } from '../../utils/slugify.js';

export const projectService = {
  /**
   * Public: List all published projects / lookbooks
   */
  async getPublicProjects() {
    const projects = await Project.find({ isPublished: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .populate('taggedProducts', 'sku slug name priceCents compareAtPriceCents images secondaryHoverImage attributes badge subtitle stock.available');

    return projects;
  },

  /**
   * Public: Get single project by slug with populated tagged products
   */
  async getPublicProjectBySlug(slug) {
    const project = await Project.findOne({
      slug: slug.toLowerCase(),
      isPublished: true
    }).populate('taggedProducts', 'sku slug name priceCents compareAtPriceCents images secondaryHoverImage attributes badge subtitle stock.available category');

    if (!project) {
      throw ApiError.notFound('Project not found or currently unavailable');
    }

    return project;
  },

  /**
   * Admin: List all projects
   */
  async getAdminProjects() {
    return Project.find()
      .sort({ sortOrder: 1, createdAt: -1 })
      .populate('taggedProducts', 'sku name status priceCents');
  },

  /**
   * Admin: Create project
   */
  async createProject(data) {
    const slug = data.slug || slugify(data.title);

    const existing = await Project.findOne({ slug });
    if (existing) {
      throw ApiError.conflict(`Project with slug "${slug}" already exists`);
    }

    const project = await Project.create({
      ...data,
      slug
    });

    return project;
  },

  /**
   * Admin: Update project
   */
  async updateProject(id, data) {
    if (data.slug) {
      const existing = await Project.findOne({ slug: data.slug, _id: { $ne: id } });
      if (existing) {
        throw ApiError.conflict(`Project with slug "${data.slug}" already exists`);
      }
    }

    const project = await Project.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    return project;
  },

  /**
   * Admin: Delete project
   */
  async deleteProject(id) {
    const project = await Project.findByIdAndDelete(id);
    if (!project) {
      throw ApiError.notFound('Project not found');
    }
    return project;
  }
};


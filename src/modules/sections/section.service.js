import { StorefrontSection } from './section.model.js';
import { ApiError } from '../../utils/ApiError.js';

export const sectionService = {
  async getSections(query = {}) {
    const filter = {};
    if (query.page) filter.page = query.page;
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive === 'true' || query.isActive === true;
    }

    return StorefrontSection.find(filter)
      .sort({ sortOrder: 1, createdAt: 1 })
      .populate('curation.category', 'name slug bannerImageUrl bannerVideoUrl')
      .populate('curation.products', 'name slug priceCents images secondaryHoverImage badge stock status subtitle')
      .lean();
  },

  async getSectionByKey(key) {
    const section = await StorefrontSection.findOne({ sectionKey: key.toLowerCase().trim() })
      .populate('curation.category', 'name slug bannerImageUrl bannerVideoUrl')
      .populate('curation.products', 'name slug priceCents images secondaryHoverImage badge stock status subtitle')
      .lean();

    if (!section) {
      throw ApiError.notFound(`Section with key "${key}" not found`, 'SECTION_NOT_FOUND');
    }
    return section;
  },

  async getSectionById(id) {
    const section = await StorefrontSection.findById(id)
      .populate('curation.category', 'name slug')
      .populate('curation.products', 'name slug priceCents images badge stock')
      .lean();

    if (!section) {
      throw ApiError.notFound('Section not found', 'SECTION_NOT_FOUND');
    }
    return section;
  },

  async createSection(data) {
    const existing = await StorefrontSection.findOne({ sectionKey: data.sectionKey.toLowerCase().trim() });
    if (existing) {
      throw ApiError.conflict(`Section with key "${data.sectionKey}" already exists`, 'SECTION_KEY_EXISTS');
    }

    const section = await StorefrontSection.create({
      ...data,
      sectionKey: data.sectionKey.toLowerCase().trim()
    });

    return StorefrontSection.findById(section._id)
      .populate('curation.category', 'name slug')
      .populate('curation.products', 'name slug priceCents images badge stock');
  },

  async updateSection(id, updateData) {
    if (updateData.sectionKey) {
      const existing = await StorefrontSection.findOne({
        sectionKey: updateData.sectionKey.toLowerCase().trim(),
        _id: { $ne: id }
      });
      if (existing) {
        throw ApiError.conflict(`Section with key "${updateData.sectionKey}" already exists`, 'SECTION_KEY_EXISTS');
      }
      updateData.sectionKey = updateData.sectionKey.toLowerCase().trim();
    }

    const section = await StorefrontSection.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    )
      .populate('curation.category', 'name slug')
      .populate('curation.products', 'name slug priceCents images badge stock');

    if (!section) {
      throw ApiError.notFound('Section not found', 'SECTION_NOT_FOUND');
    }

    return section;
  },

  async toggleSectionStatus(id, explicitStatus) {
    const section = await StorefrontSection.findById(id);
    if (!section) {
      throw ApiError.notFound('Section not found', 'SECTION_NOT_FOUND');
    }

    section.isActive = explicitStatus !== undefined ? explicitStatus : !section.isActive;
    await section.save();
    return section;
  },

  async deleteSection(id) {
    const section = await StorefrontSection.findByIdAndDelete(id);
    if (!section) {
      throw ApiError.notFound('Section not found', 'SECTION_NOT_FOUND');
    }
    return { deleted: true, id };
  }
};


// bookingcare-backend/src/controllers/clinicalAssistantController.js
// Controller cho Bộ công cụ gợi ý thông minh lâm sàng (ICD-10, Triệu chứng, Snippets)
const clinicalAssistantService = require('../services/clinicalAssistantService');

const handleSearchIcd10 = async (req, res) => {
  try {
    const { query, specialtyId, limit } = req.query;
    const doctorId = req.user?.id || req.query.doctorId;
    const result = await clinicalAssistantService.searchIcd10({
      query,
      doctorId,
      specialtyId,
      limit,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('>>> Error in handleSearchIcd10:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleSearchSymptoms = async (req, res) => {
  try {
    const { query, specialtyId, limit } = req.query;
    const result = await clinicalAssistantService.searchSymptoms({
      query,
      specialtyId,
      limit,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('>>> Error in handleSearchSymptoms:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleRecordPreference = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { termType, termKey } = req.body;
    if (!doctorId) {
      return res.status(401).json({ errCode: 1, message: 'Chưa đăng nhập!' });
    }
    const result = await clinicalAssistantService.recordDoctorPreference({
      doctorId,
      termType,
      termKey,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('>>> Error in handleRecordPreference:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleGetSnippets = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { category, specialtyId, search } = req.query;
    const result = await clinicalAssistantService.getSnippets({
      doctorId,
      category,
      specialtyId,
      search,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('>>> Error in handleGetSnippets:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleCreateSnippet = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    if (!doctorId) {
      return res.status(401).json({ errCode: 1, message: 'Chưa đăng nhập!' });
    }
    const result = await clinicalAssistantService.createDoctorSnippet(doctorId, req.body);
    const status = result.errCode === 0 ? 201 : 400;
    return res.status(status).json(result);
  } catch (error) {
    console.error('>>> Error in handleCreateSnippet:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleDeleteSnippet = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { snippetId } = req.params;
    if (!doctorId) {
      return res.status(401).json({ errCode: 1, message: 'Chưa đăng nhập!' });
    }
    const result = await clinicalAssistantService.deleteDoctorSnippet(snippetId, doctorId);
    const status = result.errCode === 0 ? 200 : (result.errCode === 404 ? 404 : 400);
    return res.status(status).json(result);
  } catch (error) {
    console.error('>>> Error in handleDeleteSnippet:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

const handleGetContextualSuggestions = async (req, res) => {
  try {
    const doctorId = req.user?.id;
    const { bookingId } = req.params;
    const result = await clinicalAssistantService.getContextualSuggestions({
      bookingId,
      doctorId,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('>>> Error in handleGetContextualSuggestions:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server!' });
  }
};

module.exports = {
  handleSearchIcd10,
  handleSearchSymptoms,
  handleRecordPreference,
  handleGetSnippets,
  handleCreateSnippet,
  handleDeleteSnippet,
  handleGetContextualSuggestions,
};

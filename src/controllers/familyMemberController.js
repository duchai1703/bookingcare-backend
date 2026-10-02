// src/controllers/familyMemberController.js
const familyMemberService = require('../services/familyMemberService');

const handleGetFamilyMembers = async (req, res) => {
  try {
    const userId = req.user?.id;
    const response = await familyMemberService.getFamilyMembers(userId);
    const statusMap = { 0: 200, 1: 400, 2: 404 };
    return res.status(statusMap[response.errCode] || 500).json(response);
  } catch (error) {
    console.error('handleGetFamilyMembers error:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ!' });
  }
};

const handleGetFamilyMemberById = async (req, res) => {
  try {
    const userId = req.user?.id;
    const memberId = req.params.id;
    const response = await familyMemberService.getFamilyMemberById(userId, memberId);
    const statusMap = { 0: 200, 1: 400, 2: 404 };
    return res.status(statusMap[response.errCode] || 500).json(response);
  } catch (error) {
    console.error('handleGetFamilyMemberById error:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ!' });
  }
};

const handleCreateFamilyMember = async (req, res) => {
  try {
    const userId = req.user?.id;
    const response = await familyMemberService.createFamilyMember(userId, req.body);
    const statusMap = { 0: 201, 1: 400, 2: 404 };
    return res.status(statusMap[response.errCode] || 500).json(response);
  } catch (error) {
    console.error('handleCreateFamilyMember error:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ!' });
  }
};

const handleUpdateFamilyMember = async (req, res) => {
  try {
    const userId = req.user?.id;
    const memberId = req.params.id;
    const response = await familyMemberService.updateFamilyMember(userId, memberId, req.body);
    const statusMap = { 0: 200, 1: 400, 2: 404 };
    return res.status(statusMap[response.errCode] || 500).json(response);
  } catch (error) {
    console.error('handleUpdateFamilyMember error:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ!' });
  }
};

const handleDeleteFamilyMember = async (req, res) => {
  try {
    const userId = req.user?.id;
    const memberId = req.params.id;
    const response = await familyMemberService.deleteFamilyMember(userId, memberId);
    const statusMap = { 0: 200, 1: 400, 2: 404 };
    return res.status(statusMap[response.errCode] || 500).json(response);
  } catch (error) {
    console.error('handleDeleteFamilyMember error:', error);
    return res.status(500).json({ errCode: -1, message: 'Lỗi server nội bộ!' });
  }
};

module.exports = {
  handleGetFamilyMembers,
  handleGetFamilyMemberById,
  handleCreateFamilyMember,
  handleUpdateFamilyMember,
  handleDeleteFamilyMember,
};

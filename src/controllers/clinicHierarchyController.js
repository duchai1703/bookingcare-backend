const clinicHierarchyService = require('../services/clinicHierarchyService');

// 1. GET /api/v1/admin/clinics/:clinicId/specialties
const handleGetClinicSpecialties = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const response = await clinicHierarchyService.getClinicSpecialties(clinicId);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handleGetClinicSpecialties:', error);
    return res.status(500).json({ errCode: -1, message: 'Internal server error' });
  }
};

// 2. POST /api/v1/admin/clinics/:clinicId/specialties/assign
const handleAssignSpecialtyToClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { specialtyId, headDoctorId, status, description, targetCapacity } = req.body;
    const response = await clinicHierarchyService.assignSpecialtyToClinic({
      clinicId,
      specialtyId,
      headDoctorId,
      status,
      description,
      targetCapacity,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handleAssignSpecialtyToClinic:', error);
    return res.status(500).json({ errCode: -1, message: 'Internal server error' });
  }
};

// 3. POST /api/v1/admin/clinics/:clinicId/specialties/unassign
const handleUnassignSpecialtyFromClinic = async (req, res) => {
  try {
    const { clinicId } = req.params;
    const { specialtyId } = req.body;
    const response = await clinicHierarchyService.unassignSpecialtyFromClinic({
      clinicId,
      specialtyId,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handleUnassignSpecialtyFromClinic:', error);
    return res.status(500).json({ errCode: -1, message: 'Internal server error' });
  }
};

// 4. GET /api/v1/admin/clinics/:clinicId/specialties/:specialtyId/workspace
const handleGetClinicSpecialtyWorkspace = async (req, res) => {
  try {
    const { clinicId, specialtyId } = req.params;
    const response = await clinicHierarchyService.getClinicSpecialtyWorkspace(clinicId, specialtyId);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handleGetClinicSpecialtyWorkspace:', error);
    return res.status(500).json({ errCode: -1, message: 'Internal server error' });
  }
};

// 5. POST /api/v1/admin/clinics/:clinicId/specialties/:specialtyId/assign-doctor
const handleAssignDoctorToClinicSpecialty = async (req, res) => {
  try {
    const { clinicId, specialtyId } = req.params;
    const { doctorId, roomNumber, priceId, commissionRate, workingStatus, isPrimary, note } = req.body;
    const response = await clinicHierarchyService.assignDoctorToClinicSpecialty({
      clinicId,
      specialtyId,
      doctorId,
      roomNumber,
      priceId,
      commissionRate,
      workingStatus,
      isPrimary,
      note,
    });
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handleAssignDoctorToClinicSpecialty:', error);
    return res.status(500).json({ errCode: -1, message: 'Internal server error' });
  }
};

// 6. PUT /api/v1/admin/doctor-assignments/:assignmentId
const handleUpdateDoctorAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const response = await clinicHierarchyService.updateDoctorAssignment(assignmentId, req.body);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handleUpdateDoctorAssignment:', error);
    return res.status(500).json({ errCode: -1, message: 'Internal server error' });
  }
};

// 7. DELETE /api/v1/admin/doctor-assignments/:assignmentId
const handleUnassignDoctorFromClinicSpecialty = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const response = await clinicHierarchyService.unassignDoctorFromClinicSpecialty(assignmentId);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handleUnassignDoctorFromClinicSpecialty:', error);
    return res.status(500).json({ errCode: -1, message: 'Internal server error' });
  }
};

// 8. GET /api/v1/admin/doctors/:doctorId/assignments
const handleGetDoctorAssignments = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const response = await clinicHierarchyService.getDoctorAssignments(doctorId);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in handleGetDoctorAssignments:', error);
    return res.status(500).json({ errCode: -1, message: 'Internal server error' });
  }
};

module.exports = {
  handleGetClinicSpecialties,
  handleAssignSpecialtyToClinic,
  handleUnassignSpecialtyFromClinic,
  handleGetClinicSpecialtyWorkspace,
  handleAssignDoctorToClinicSpecialty,
  handleUpdateDoctorAssignment,
  handleUnassignDoctorFromClinicSpecialty,
  handleGetDoctorAssignments,
};

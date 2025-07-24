import mongoose from 'mongoose';
import Patient from '../models/patientModel.js';

/**
 * Find patient with flexible input - prefers MongoDB ID, falls back to patientID
 * @param {string} patientIdentifier - Either MongoDB ObjectId or patientID string
 * @param {string} patientMongoId - Optional MongoDB ObjectId
 * @param {object} options - Optional parameters
 * @returns {Promise<Patient|null>} - Patient document or null
 */
export const findPatientFlexible = async (patientIdentifier, patientMongoId = null, options = {}) => {
  // Default options
  const {
    strictMode = false,        // If true, throw error on duplicates
    preferRecent = true,       // If multiple found, prefer most recent
    includeInactive = false    // Include inactive patients
  } = options;

  try {
    // 1. If MongoDB ID is provided, use it directly (fastest)
    if (patientMongoId && mongoose.Types.ObjectId.isValid(patientMongoId)) {
      console.log(`🔍 Using MongoDB ID: ${patientMongoId}`);
      const patient = await Patient.findById(patientMongoId);
      
      if (!patient) {
        console.warn(`⚠️ Patient not found with MongoDB ID: ${patientMongoId}`);
        return null;
      }
      
      // Verify patientID matches if provided
      if (patientIdentifier && patient.patientID !== patientIdentifier) {
        console.warn(`⚠️ Patient ID mismatch: Expected ${patientIdentifier}, got ${patient.patientID}`);
        if (strictMode) {
          throw new Error(`Patient ID mismatch: MongoDB ID ${patientMongoId} belongs to patient ${patient.patientID}, not ${patientIdentifier}`);
        }
      }
      
      return patient;
    }
    
    // 2. If identifier looks like ObjectId, try it as MongoDB ID
    if (mongoose.Types.ObjectId.isValid(patientIdentifier)) {
      console.log(`🔍 Identifier is MongoDB ID: ${patientIdentifier}`);
      return await Patient.findById(patientIdentifier);
    }
    
    // 3. Find by patientID string (may return multiple)
    console.log(`🔍 Using patientID string: ${patientIdentifier}`);
    
    // Build query
    const query = { patientID: patientIdentifier };
    if (!includeInactive) {
      // Add filter for active patients if you have isActive field
      // query.isActive = { $ne: false };
    }
    
    const patients = await Patient.find(query).sort({ createdAt: -1 }); // Most recent first
    
    if (patients.length === 0) {
      console.log(`❌ No patients found with patientID: ${patientIdentifier}`);
      return null;
    }
    
    if (patients.length === 1) {
      console.log(`✅ Single patient found with patientID: ${patientIdentifier}`);
      return patients[0];
    }
    
    // Multiple patients found - handle based on options
    console.warn(`⚠️ Multiple patients found with patientID: ${patientIdentifier} (Count: ${patients.length})`);
    console.warn(`📊 Patient details:`, patients.map(p => ({
      _id: p._id,
      patientID: p.patientID,
      fullName: p.computed?.fullName,
      createdAt: p.createdAt,
      sourceLab: p.sourceLab
    })));
    
    if (strictMode) {
      throw new Error(`Multiple patients found with ID ${patientIdentifier}. Please specify MongoDB ID for precise lookup.`);
    }
    
    // Return most recent by default
    const selectedPatient = preferRecent ? patients[0] : patients[patients.length - 1];
    console.warn(`🎯 Selected patient: ${selectedPatient._id} (${preferRecent ? 'most recent' : 'oldest'})`);
    
    return selectedPatient;
    
  } catch (error) {
    console.error(`❌ Error in findPatientFlexible:`, error);
    throw error;
  }
};

/**
 * Build flexible patient query
 */
export const buildFlexiblePatientQuery = (patientIdentifier, patientMongoId = null, options = {}) => {
  const { includeInactive = false } = options;
  
  if (patientMongoId && mongoose.Types.ObjectId.isValid(patientMongoId)) {
    return { _id: patientMongoId };
  }
  
  if (mongoose.Types.ObjectId.isValid(patientIdentifier)) {
    return { _id: patientIdentifier };
  }
  
  const query = { patientID: patientIdentifier };
  
  if (!includeInactive) {
    // Add filter for active patients if needed
    // query.isActive = { $ne: false };
  }
  
  return query;
};

/**
 * Get patient MongoDB ID from string patientID (handles duplicates better)
 */
export const getPatientMongoId = async (patientId, options = {}) => {
  try {
    const patient = await findPatientFlexible(patientId, null, options);
    return patient ? patient._id.toString() : null;
  } catch (error) {
    console.error('Error getting patient MongoDB ID:', error);
    if (options.strictMode) {
      throw error;
    }
    return null;
  }
};

/**
 * Validate patient exists and get both IDs
 */
export const validateAndGetPatientIds = async (patientIdentifier, patientMongoId = null) => {
  try {
    const patient = await findPatientFlexible(patientIdentifier, patientMongoId, { strictMode: false });
    
    if (!patient) {
      return {
        exists: false,
        error: `Patient not found: ${patientIdentifier}`,
        patientId: null,
        patientMongoId: null
      };
    }
    
    return {
      exists: true,
      error: null,
      patientId: patient.patientID,
      patientMongoId: patient._id.toString(),
      patient: patient
    };
    
  } catch (error) {
    return {
      exists: false,
      error: error.message,
      patientId: null,
      patientMongoId: null
    };
  }
};

export default {
  findPatientFlexible,
  buildFlexiblePatientQuery,
  getPatientMongoId,
  validateAndGetPatientIds
};
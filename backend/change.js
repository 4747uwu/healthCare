import mongoose from 'mongoose';
import User from './models/userModel.js'; // Adjust path based on your structure
import Doctor from './models/doctorModel.js'; // For verification

const MONGO_URI = 'mongodb://alice:alicePassword@64.227.187.164:27017/medical_project?authSource=admin&directConnection=true'; // Replace with your actual MongoDB URI
const emailToReset = 'drag2@starradiology.com';
const newPassword = 'star@star'; // Or any new temporary password

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Find the user by email
    const user = await User.findOne({ email: emailToReset });
    if (!user) {
      console.error('❌ User not found with email:', emailToReset);
      process.exit(1);
    }

    console.log('🔍 Found user:', {
      _id: user._id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive
    });

    // Verify this is a doctor account
    if (user.role !== 'doctor_account') {
      console.warn('⚠️ Warning: This user is not a doctor account. Role:', user.role);
    }

    // Find the associated doctor profile (optional verification)
    const doctorProfile = await Doctor.findOne({ userAccount: user._id })
      .select('specialization licenseNumber isActiveProfile');
    
    if (doctorProfile) {
      console.log('👨‍⚕️ Doctor profile found:', {
        specialization: doctorProfile.specialization,
        licenseNumber: doctorProfile.licenseNumber,
        isActiveProfile: doctorProfile.isActiveProfile
      });
    } else {
      console.warn('⚠️ No doctor profile found for this user');
    }

    // Update the password (the pre('save') middleware will handle hashing)
    user.password = newPassword;
    user.isLoggedIn = false; // Force logout
    
    await user.save();

    console.log('✅ Password successfully updated!');
    console.log('📧 Email:', user.email);
    console.log('👤 Username:', user.username);
    console.log('🔑 New temporary password:', newPassword);
    console.log('');
    console.log('🔒 The password has been automatically hashed and stored securely.');
    console.log('📱 The user should be able to login with the new password immediately.');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error updating password:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📱 Disconnected from MongoDB');
  }
})();
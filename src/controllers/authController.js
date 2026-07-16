import sql from '../config/db.js'
import bcrypt from 'bcrypt'
import { sendOtpEmail, sendWelcomeEmail, sendApprovalEmail } from '../services/emailService.js'
import path from 'path'
import fs from 'fs'
import jwt from 'jsonwebtoken'

const otpStore = {}

export const sendOtp = async (req, res) => {
  try {
    const identifier = req.body.identifier?.trim()

    const request = new sql.Request()
    request.input('Identifier', sql.NVarChar, identifier)

    const result = await request.execute('[banc].[usp_ValidateUser]')

    if (result.recordset.length === 0) {
      return res.json({ success: false, message: 'Invalid user' })
    }

    const user = result.recordset[0]
    const email = user.Email

    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    otpStore[email] = {
      otp,
      expires: Date.now() + 5 * 60 * 1000
    }

    console.log('Sending OTP to:', email)
    console.log('Generated OTP:', otp)

    await sendOtpEmail(email, otp)

    res.json({ success: true })
  } catch (error) {
    console.error('Send OTP Error:', error)
    res.status(500).json({ success: false })
  }
}

export const verifyOtp = async (req, res) => {
  try {
    const identifier = req.body.identifier?.trim();
    const { otp } = req.body;

    const request = new sql.Request();
    request.input('Identifier', sql.NVarChar, identifier);

    const result = await request.execute('[banc].[usp_ValidateUser]');

    if (result.recordset.length === 0) {
      return res.json({ success: false });
    }

    const user = result.recordset[0];
    const email = user.Email;
    const record = otpStore[email];

    if (!record) {
      return res.json({ success: false, message: 'No OTP found' });
    }

    if (record.expires < Date.now()) {
      return res.json({ success: false, message: 'OTP expired' });
    }

    if (record.otp !== otp) {
      return res.json({ success: false, message: 'Invalid OTP' });
    }

    // ✅ Clear OTP immediately on successful use to prevent reuse replay attacks
    delete otpStore[email];

    // ✅ 1. Generate a secure JWT payload
    const tokenPayload = {
      UserId: user.UserId,
      UserCode: user.UserCode,
      Role: user.Role
    };

    // ✅ 2. Sign the token (Use a long random string in your backend .env file)
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // Token expires in 8 hours
    );

    // ✅ 3. Send token via secure, HTTP-Only Cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use true in production (requires HTTPS)
      sameSite: 'Strict',                     // Mitigates CSRF attacks
      maxAge: 8 * 60 * 60 * 1000              // Matches token expiration (8 hours)
    });

    // Send only public non-sensitive details back in JSON
    res.json({
      success: true,
      user: {
        UserId: user.UserId,
        UserCode: user.UserCode,
        FullName: user.FullName,
        Role: user.Role,
        Photo: user.Photo,
        BranchCode: user.BranchCode,
        AreaCode: user.AreaCode,
        AOCode: user.AOCode
      }
    });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({ success: false });
  }
};

export const loginStep1 = async (req, res) => {
  try {
    const identifier = req.body.identifier?.trim()
    const { password } = req.body

    const request = new sql.Request()
    request.input('Identifier', sql.NVarChar, identifier)

    const result = await request.execute('[banc].[usp_ValidateUser]')

    if (result.recordset.length === 0) {
      return res.json({ success: false, message: 'Invalid credentials' })
    }

    const user = result.recordset[0]

    // ✅ Check StatusCode from SP
    if (user.StatusCode === 'NOT_FOUND') {
      return res.json({ success: false, message: 'Invalid credentials' })
    }

    if (user.StatusCode === 'PENDING') {
      return res.json({ success: false, message: 'Your account is pending approval. Please wait for your Branch Head to approve your registration.' })
    }

    if (user.StatusCode === 'DEACTIVATED') {
      return res.json({ success: false, message: 'Your account has been deactivated. Please contact your Branch Head.' })
    }

    if (!user.PasswordHash) {
      return res.json({ success: false, message: 'No password set' })
    }

    console.log('Password received:', password);
    console.log('Hash from DB:', user.PasswordHash);


    const isMatch = await bcrypt.compare(password, user.PasswordHash)

    console.log('Match Result:', isMatch);

    if (!isMatch) {
      return res.json({ success: false, message: 'Invalid credentials' })
    }

    const email = user.Email

    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    otpStore[email] = {
      otp,
      expires: Date.now() + 5 * 60 * 1000
    }

    console.log('2FA OTP:', otp)

    await sendOtpEmail(email, otp)

    res.json({ success: true })
  } catch (error) {
    console.error('Login Step1 Error:', error)
    res.status(500).json({ success: false })
  }
}

export const changePassword = async (req, res) => {
  try {
    const { userCode, currentPassword, newPassword } = req.body

    const request = new sql.Request()
    request.input('UserCode', sql.NVarChar, userCode)

    const result = await request.query(`
      SELECT PasswordHash
      FROM banc.Users
      WHERE UserCode = @UserCode
    `)

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    const user = result.recordset[0]

    const isMatch = await bcrypt.compare(currentPassword, user.PasswordHash)

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      })
    }

    const newHash = await bcrypt.hash(newPassword, 10)

    const updateRequest = new sql.Request()
    updateRequest.input('UserCode', sql.NVarChar, userCode)
    updateRequest.input('PasswordHash', sql.NVarChar, newHash)

    await updateRequest.execute('[banc].[usp_upd_user_password]')

    res.json({
      success: true,
      message: 'Password updated successfully'
    })
  } catch (error) {
    console.error('❌ Change Password Error:', error)
    res.status(500).json({
      success: false,
      message: 'Server error'
    })
  }
}

export const uploadProfilePhoto = async (req, res) => {
  try {
    const { userCode } = req.body

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const getRequest = new sql.Request()
    getRequest.input('UserCode', sql.NVarChar, userCode)

    const existing = await getRequest.query(`
      SELECT Photo
      FROM banc.Users
      WHERE UserCode = @UserCode
    `)

    const oldPhoto = existing.recordset[0]?.Photo

    const newFileName = req.file.filename

    const updateRequest = new sql.Request()
    updateRequest.input('UserCode', sql.NVarChar, userCode)
    updateRequest.input('Photo', sql.NVarChar, newFileName)

    await updateRequest.query(`
      UPDATE banc.Users
      SET Photo = @Photo
      WHERE UserCode = @UserCode
    `)

    // ✅ DELETE OLD FILE (IF EXISTS)
    if (oldPhoto) {
      const oldPath = path.join('avatar_uploads', oldPhoto)

      fs.unlink(oldPath, (err) => {
        if (err) {
          console.warn('⚠ Could not delete old file:', oldPhoto)
        } else {
          console.log('✅ Old photo deleted:', oldPhoto)
        }
      })
    }

    res.json({
      success: true,
      message: 'Profile photo updated',
      file: newFileName
    })

  } catch (error) {
    console.error('❌ Upload Error:', error)
    res.status(500).json({ message: 'Upload failed' })
  }
}


// Adding the get group area names and branches

export const getGroups = async (req, res) => {
  try {
    const request = new sql.Request()
    const result = await request.query(`
      SELECT AreaCode, AreaName
      FROM banc.group_areas
      ORDER BY AreaName
    `)
    res.json({ success: true, data: result.recordset })
  } catch (error) {
    console.error('❌ Get Groups Error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}

export const getBranches = async (req, res) => {
  try {
    const { areaCode } = req.query
    const request = new sql.Request()

    if (areaCode) {
      request.input('AreaCode', sql.Int, areaCode)
      const result = await request.query(`
        SELECT BranchCode, BranchName, AreaCode
        FROM banc.branches
        WHERE AreaCode = @AreaCode
        ORDER BY BranchName
      `)
      return res.json({ success: true, data: result.recordset })
    }

    const result = await request.query(`
      SELECT BranchCode, BranchName, AreaCode
      FROM banc.branches
      ORDER BY BranchName
    `)
    res.json({ success: true, data: result.recordset })
  } catch (error) {
    console.error('❌ Get Branches Error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
}


//  ✅ CHECK EMAIL
export const checkEmail = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.json({ exists: false });

    const request = new sql.Request();
    request.input('Email', sql.NVarChar, email.trim());
    request.input('CheckOnly', sql.Bit, 1);

    const result = await request.execute('banc.usp_ins_register_user');
    return res.json({ exists: result.recordset[0].exists === 1 });
  } catch (error) {
    console.error('❌ Check Email Error:', error);
    return res.status(500).json({ exists: false });
  }
};

// ✅ REGISTER USER
export const register = async (req, res) => {
  try {
    const {
      firstName, middleName, lastName, suffix,
      birthday, email, mobileNumber, position,
      role, areaCode, branchCode
    } = req.body;

    // ✅ Auto-generate a temporary password
    const tempPassword = Math.random().toString(36).slice(-8) +
      Math.random().toString(36).toUpperCase().slice(-4);

    // ✅ Hash it before storing
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const request = new sql.Request();
    request.input('Email', sql.NVarChar, email);
    request.input('CheckOnly', sql.Bit, 0);
    request.input('FirstName', sql.NVarChar, firstName);
    request.input('MiddleName', sql.NVarChar, middleName || null);
    request.input('LastName', sql.NVarChar, lastName);
    request.input('Suffix', sql.NVarChar, suffix || null);
    request.input('Birthday', sql.Date, birthday);
    request.input('MobileNumber', sql.NVarChar, mobileNumber);
    request.input('Position', sql.NVarChar, position);
    request.input('Role', sql.NVarChar, role);
    request.input('AreaCode', sql.NVarChar, areaCode || null);
    request.input('BranchCode', sql.Int, branchCode || null);
    request.input('PasswordHash', sql.NVarChar, passwordHash);

    const result = await request.execute('banc.usp_ins_register_user');
    const { Success, Message, UserCode } = result.recordset[0];

    if (Success === 1) {
      // ✅ Send welcome email with temp password
      await sendWelcomeEmail(email, firstName, UserCode, tempPassword);
      return res.json({ success: true, message: Message, userCode: UserCode });
    } else {
      return res.json({ success: false, message: Message });
    }
  } catch (error) {
    console.error('❌ Register Error:', error);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};

// ✅ GET USERS FOR APPROVAL (Branch Head only)
export const getUsersForApproval = async (req, res) => {
  try {
    const { branchCode, status = 'ALL' } = req.query;

    const request = new sql.Request();
    request.input('BranchCode', sql.Int, parseInt(branchCode));
    request.input('StatusFilter', sql.NVarChar, status);

    const result = await request.execute('banc.usp_sel_users_for_approval');
    return res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('❌ Get Users For Approval Error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ✅ APPROVE OR REJECT USER (Branch Head only)
export const approveRejectUser = async (req, res) => {
  try {
    const { userId, action } = req.body;

    const request = new sql.Request();
    request.input('UserId', sql.Int, userId);
    request.input('Action', sql.NVarChar, action);

    const result = await request.execute('banc.usp_ins_approve_reject_user');
    const { Success, Message, FirstName, Email, UserCode } = result.recordset[0];

    if (Success === 1) {
      await sendApprovalEmail(Email, FirstName, UserCode, action);
      return res.json({ success: true, message: Message });
    } else {
      return res.json({ success: false, message: Message });
    }
  } catch (error) {
    console.error('❌ Approve/Reject Error:', error);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
};
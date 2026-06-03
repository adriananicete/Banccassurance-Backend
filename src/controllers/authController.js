import sql from '../config/db.js'
import bcrypt from 'bcrypt'
import { sendOtpEmail } from '../services/emailService.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

/* =========================================================
   ✅ MULTER CONFIG (UPLOAD)
========================================================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'avatar_uploads/')
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const safeName = `${Date.now()}${ext}`
    cb(null, safeName)
  }
})

export const upload = multer({
  storage,

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files allowed'), false)
    }
    cb(null, true)
  },

  limits: {
    fileSize: 2 * 1024 * 1024 // ✅ 2MB
  }
})

/* =========================================================
   ✅ OTP STORE
========================================================= */

const otpStore = {}

/* =========================================================
   ✅ SEND OTP
========================================================= */

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

/* =========================================================
   ✅ VERIFY OTP
========================================================= */

export const verifyOtp = async (req, res) => {
  try {
    const identifier = req.body.identifier?.trim()
    const { otp } = req.body

    const request = new sql.Request()
    request.input('Identifier', sql.NVarChar, identifier)

    const result = await request.execute('[banc].[usp_ValidateUser]')

    if (result.recordset.length === 0) {
      return res.json({ success: false })
    }

    const user = result.recordset[0]
    const email = user.Email

    const record = otpStore[email]

    if (!record) {
      return res.json({ success: false, message: 'No OTP found' })
    }

    if (record.expires < Date.now()) {
      return res.json({ success: false, message: 'OTP expired' })
    }

    if (record.otp !== otp) {
      return res.json({ success: false, message: 'Invalid OTP' })
    }

    delete otpStore[email]

    res.json({
      success: true,
      user: {
        UserId: user.UserId,
        UserCode: user.UserCode,
        FullName: user.FullName,
        Role: user.Role,
        Photo: user.Photo
      }
    })
  } catch (error) {
    console.error('Verify OTP Error:', error)
    res.status(500).json({ success: false })
  }
}

/* =========================================================
   ✅ LOGIN STEP 1 (PASSWORD + OTP)
========================================================= */

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

    if (!user.PasswordHash) {
      return res.json({ success: false, message: 'No password set' })
    }

    const isMatch = await bcrypt.compare(password, user.PasswordHash)

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

/* =========================================================
   ✅ CHANGE PASSWORD
========================================================= */

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

/* =========================================================
   ✅ UPLOAD PROFILE PHOTO
========================================================= */

export const uploadProfilePhoto = async (req, res) => {
  try {
    const { userCode } = req.body

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    // ✅ GET OLD PHOTO FIRST
    const getRequest = new sql.Request()
    getRequest.input('UserCode', sql.NVarChar, userCode)

    const existing = await getRequest.query(`
      SELECT Photo
      FROM banc.Users
      WHERE UserCode = @UserCode
    `)

    const oldPhoto = existing.recordset[0]?.Photo

    const newFileName = req.file.filename

    // ✅ UPDATE DB WITH NEW PHOTO
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

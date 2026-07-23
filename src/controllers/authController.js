import jwt from 'jsonwebtoken'
import path from 'path'
import fs from 'fs'
import * as userService from '../services/userService.js'

export const sendOtp = async (req, res, next) => {
  try {
    const identifier = req.body.identifier?.trim()
    const result = await userService.sendOtp(identifier)
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export const verifyOtp = async (req, res, next) => {
  try {
    const identifier = req.body.identifier?.trim()
    const { otp } = req.body

    const result = await userService.verifyOtp(identifier, otp)

    if (!result.success) {
      return res.json(result)
    }

    const { user } = result

    let aoFullName = null
    if (user.AOCode) {
      // Assuming your userService has a method to find a user by their UserCode
      const accountOfficer = await userService.findByUserCode(user.AOCode)
      aoFullName = accountOfficer ? accountOfficer.FullName : null
    }

    // ✅ 1. Generate a secure JWT payload
    const tokenPayload = {
      UserId: user.UserId,
      UserCode: user.UserCode,
      Role: user.Role,
      BranchCode: user.BranchCode,
      AreaCode: user.AreaCode,
      AOCode: user.AOCode
    }

    // ✅ 2. Sign the token (Use a long random string in your backend .env file)
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // Token expires in 8 hours
    )

    // ✅ 3. Send token via secure, HTTP-Only Cookie
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use true in production (requires HTTPS)
      sameSite: 'Strict',                     // Mitigates CSRF attacks
      maxAge: 8 * 60 * 60 * 1000              // Matches token expiration (8 hours)
    })

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
        AOCode: user.AOCode,
        aoFullName: aoFullName
      }
    })
  } catch (error) {
    next(error)
  }
}

export const loginStep1 = async (req, res, next) => {
  try {
    const identifier = req.body.identifier?.trim()
    const { password } = req.body
    const result = await userService.loginStep1(identifier, password)
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export const logout = async (req, res, next) => {
  try {
    res.clearCookie('auth_token',  {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Strict',
      
    })

    return res.status(200).json({
      success: true,
      message: 'User logged out'
    })
  } catch (error) {
    next(error)
  }
}

export const changePassword = async (req, res, next) => {
  try {
    const { userCode, currentPassword, newPassword } = req.body
    const result = await userService.changePassword(userCode, currentPassword, newPassword)
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export const uploadProfilePhoto = async (req, res, next) => {
  try {
    const { userCode } = req.body

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const newFileName = req.file.filename
    const { oldPhoto } = await userService.uploadProfilePhoto(userCode, newFileName)

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
    next(error)
  }
}

export const getGroups = async (req, res, next) => {
  try {
    const data = await userService.getGroups()
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

export const getBranches = async (req, res, next) => {
  try {
    const { areaCode } = req.query
    const data = await userService.getBranches(areaCode)
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

// ✅ CHECK EMAIL
export const checkEmail = async (req, res, next) => {
  try {
    const { email } = req.query
    if (!email) return res.json({ exists: false })

    const exists = await userService.checkEmail(email.trim())
    return res.json({ exists })
  } catch (error) {
    next(error)
  }
}

// ✅ REGISTER USER
export const register = async (req, res, next) => {
  try {
    const {
      firstName, middleName, lastName, suffix,
      birthday, email, mobileNumber, position,
      role, areaCode, branchCode, employeeNo
    } = req.body

    const result = await userService.register({
      firstName, middleName, lastName, suffix,
      birthday, email, mobileNumber, position,
      role, areaCode, branchCode, employeeNo
    })

    return res.json(result)
  } catch (error) {
    next(error)
  }
}

// ✅ GET USERS FOR APPROVAL (Branch Head only)
export const getUsersForApproval = async (req, res, next) => {
  try {
    const { status = 'ALL' } = req.query
    const data = await userService.getUsersForApproval(req.user, status)
    return res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

// ✅ APPROVE OR REJECT USER (Branch Head only)
export const approveRejectUser = async (req, res, next) => {
  try {
    const { userId, action } = req.body
    const result = await userService.approveRejectUser(req.user, userId, action)
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

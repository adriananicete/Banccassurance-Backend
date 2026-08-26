import jwt from 'jsonwebtoken'
import * as userService from '../services/userService.js'

export const verifyOtp = async (req, res, next) => {
  try {
    const identifier = req.body.identifier?.trim()
    const { otp } = req.body

    const result = await userService.verifyOtp(identifier, otp)


    const { user } = result

    let aoFullName = null
    if (user.AOCode) {
      const accountOfficer = await userService.findByUserCode(user.AOCode)
      aoFullName = accountOfficer ? accountOfficer.FullName : null
    }


    const tokenPayload = {
      UserId: user.UserId,
      UserCode: user.UserCode,
      Role: user.Role,
      BranchCode: user.BranchCode,
      GroupCode: user.GroupCode,
      AOCode: user.AOCode
    }

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '8h' } 
    )

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use true in production (requires HTTPS)
      sameSite: 'Strict',                     // Mitigates CSRF attacks
      maxAge: 8 * 60 * 60 * 1000              // Matches token expiration (8 hours)
    })

    res.json({
      success: true,
      user: {
        UserId: user.UserId,
        UserCode: user.UserCode,
        FullName: user.FullName,
        Role: user.Role,
        Photo: user.Photo,
        BranchCode: user.BranchCode,
        AreaCode: user.GroupCode,
        GroupCode: user.GroupCode,
        AOCode: user.AOCode,
        aoFullName: aoFullName,
        EmployeeNo: user.EmployeeNo,
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


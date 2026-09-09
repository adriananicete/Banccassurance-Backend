import jwt from 'jsonwebtoken'
import * as userModel from '../models/userModel.js'

export const requireAuth = async (req, res, next) => {
  const token = req.cookies?.auth_token

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authenticated' })
  }

  let claims

  try {
    claims = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' })
  }

  const userId = Number(claims.UserId)

  if (!Number.isInteger(userId)) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' })
  }

  try {
    const result = await userModel.getUserScopeById(userId).run()
    const account = result.recordset[0]

    if (!account) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session' })
    }

    if (account.IsActive !== 1 && account.IsActive !== true) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated. Please contact your Branch Head.',
      })
    }

    req.user = {
      UserId: account.UserId,
      UserCode: account.UserCode,
      FullName: account.FullName,
      Role: account.Role,
      BranchCode: account.BranchCode,
      GroupCode: account.GroupCode,
    }

    next()
  } catch (error) {
    next(error)
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.Role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' })
  }
  next()
}

import jwt from 'jsonwebtoken'

export const requireAuth = (req, res, next) => {
  const token = req.cookies?.auth_token

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authenticated' })
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET) // { UserId, UserCode, Role }
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' })
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.Role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' })
  }
  next()
}

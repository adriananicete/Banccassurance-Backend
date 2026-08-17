import * as userService from '../services/userService.js'

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

export const getUsersForApproval = async (req, res, next) => {
  try {
    const { status = 'ALL' } = req.query
    const data = await userService.getUsersForApproval(req.user, status)
    return res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
}

export const approveRejectUser = async (req, res, next) => {
  try {
    const { userId, action } = req.body
    const result = await userService.approveRejectUser(req.user, userId, action)
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

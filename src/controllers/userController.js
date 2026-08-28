import path from 'path'
import fs from 'fs'
import * as userService from '../services/userService.js'
import { paging } from '../utils/paging.js'

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
      birthday, email, mobileNumber,
      role, groupCode, branchCode, employeeNo
    } = req.body

    const result = await userService.register({
      firstName, middleName, lastName, suffix,
      birthday, email, mobileNumber,
      role, groupCode, branchCode, employeeNo
    })

    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export const getUsersForApproval = async (req, res, next) => {
  try {
    const { search, status = 'ALL' } = req.query

    const result = await userService.getUsersForApproval(req.user, {
      StatusFilter: status,
      Search: search || null,
      ...paging(req.query),
    })

    return res.json({ success: true, ...result })
  } catch (error) {
    next(error)
  }
}

export const createTopLevelUser = async (req, res, next) => {
  try {
    const {
      firstName, middleName, lastName, suffix,
      birthday, email, mobileNumber,
      role, employeeNo
    } = req.body

    const result = await userService.createTopLevelUser(req.user, {
      firstName, middleName, lastName, suffix,
      birthday, email, mobileNumber,
      role, employeeNo
    })

    return res.status(201).json(result)
  } catch (error) {
    next(error)
  }
}

export const deleteUser = async (req, res, next) => {
  try {
    const { userId } = req.params
    const result = await userService.deleteUser(req.user, userId)
    return res.json(result)
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

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    const { UserCode } = req.user;

    const result = await userService.changePassword(UserCode, currentPassword, newPassword)
    res.json(result)
  } catch (error) {
    next(error)
  }
}

export const uploadProfilePhoto = async (req, res, next) => {
  try {
    const { UserCode } = req.user;

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' })
    }

    const newFileName = req.file.filename
    const { oldPhoto } = await userService.uploadProfilePhoto(UserCode, newFileName)

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

export const getOwnScope = async (req, res, next) => {
  try {
    const result = await userService.getOwnScope(req.user)
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export const getAssignableBranches = async (req, res, next) => {
  try {
    const { groupCode } = req.query
    const result = await userService.getAssignableBranches(req.user, groupCode)
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export const getAccountOfficerBranches = async (req, res, next) => {
  try {
    const { userId } = req.params
    const result = await userService.getAccountOfficerBranches(req.user, userId)
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export const getAreaSalesHeadAreas = async (req, res, next) => {
  try {
    const { userId } = req.params
    const result = await userService.getAreaSalesHeadAreas(req.user, userId)
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export const getRegionalSalesHeadAreas = async (req, res, next) => {
  try {
    const { userId } = req.params
    const result = await userService.getRegionalSalesHeadAreas(req.user, userId)
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export const replaceAccountOfficerBranches = async (req, res, next) => {
  try {
    const { userId } = req.params
    const { branchCodes } = req.body

    const result = await userService.replaceAccountOfficerBranches(
      req.user, userId, branchCodes
    )
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export const replaceAreaSalesHeadAreas = async (req, res, next) => {
  try {
    const { userId } = req.params
    const { groupCodes } = req.body

    const result = await userService.replaceAreaSalesHeadAreas(
      req.user, userId, groupCodes
    )
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

export const replaceRegionalSalesHeadAreas = async (req, res, next) => {
  try {
    const { userId } = req.params
    const { groupCodes } = req.body

    const result = await userService.replaceRegionalSalesHeadAreas(
      req.user, userId, groupCodes
    )
    return res.json(result)
  } catch (error) {
    next(error)
  }
}

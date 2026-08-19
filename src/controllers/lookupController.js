import * as userService from '../services/userService.js'
import * as referralService from '../services/referralService.js'

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

export const getPlans = async (req, res, next) => {
  try {
    const data = await referralService.getPlans();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

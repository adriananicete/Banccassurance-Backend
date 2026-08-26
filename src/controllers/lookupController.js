import * as userService from '../services/userService.js'
import * as referralService from '../services/referralService.js'
import { paging } from '../utils/paging.js'
import { branchListPageSize } from '../utils/constant.js'

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
    const { areaCode, search } = req.query
    const result = await userService.getBranches(
      areaCode,
      search,
      paging(req.query, branchListPageSize),
    )
    res.json({ success: true, ...result })
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

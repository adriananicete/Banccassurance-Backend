import * as reportService from "../services/reportService.js";

export const getSummary = async (req, res, next) => {
  try {
    const data = await reportService.getSummary(req.query, req.user);

    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

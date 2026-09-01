import * as reportService from "../services/reportService.js";
import { periodLabel } from "../utils/reportPeriod.js";

export const getSummary = async (req, res, next) => {
  try {
    const data = await reportService.getSummary(req.query, req.user);

    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
};

export const exportReferrals = async (req, res, next) => {
  try {
    const { period, rows } = await reportService.getExportRows(req.query, req.user);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="referrals-${periodLabel(period)}.xlsx"`,
    );

    await reportService.writeReferralWorkbook(rows, res);
  } catch (error) {
    next(error);
  }
};

import * as messagingService from "../services/messagingService.js";

export const canMessage = async (req, res, next) => {
  try {
    const target = await messagingService.assertCanMessage(
      req.user,
      req.params.userCode,
    );

    res.json({
      success: true,
      data: { userCode: target.UserCode, fullName: target.FullName, role: target.Role },
    });
  } catch (error) {
    next(error);
  }
};

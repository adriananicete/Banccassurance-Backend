import underwritingService from '../services/underwritingService.js'

export const getUnderwritingReferrals = async (req, res, next) => {
    try {
        const { areaCode, aoCode } = req.query
        const underWritingData = await underwritingService.getUnderwritingReferrals({areaCode, aoCode});

        return res.status(200).json({
            success: true,
            data: underWritingData
        })
    } catch (error) {
        next(error)
    }

};

export const updateUnderwritingStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        await underwritingService.updateUnderwritingStatus(id, status);

        return res.status(200).json({
            success: true,
            message: "Status updated successfully"
        })
    } catch (error) {
        next(error)
    }
}
import { throwHttpError } from "../utils/error.js";

export const requireApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key']

    if(apiKey !== process.env.UNDERWRITING_API_KEY) throwHttpError(401, 'Unauthorized: Access Denied')

    next();
}
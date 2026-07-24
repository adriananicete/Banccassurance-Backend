export const throwHttpError = (statusCode, message, data) => {
    const err = new Error(message);
    err.statusCode = statusCode;

    if(data) err.data = data;
    throw err;
}
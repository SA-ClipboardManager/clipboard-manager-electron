import CCDError from '../CCDError.js';

export const wrap = (handler, module, context) => {
  return async (event, payload) => {
    try {
      return await handler(event, payload);
    } catch (err) {
      const error =
        err instanceof CCDError
          ? err
          : CCDError.create(err.code || "E000", {
              module,
              context,
              details: err.message,
            });

      console.error(error);
      return error.toJSON();
    }
  };
};
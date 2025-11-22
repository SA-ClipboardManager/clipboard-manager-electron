const axios = require("axios");

const createHttpClient = (baseURL) => {
  return axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
    timeout: 5000, // 공통 타임아웃 설정 등
  });
};

module.exports = { createHttpClient };

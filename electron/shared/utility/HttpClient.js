const axios = require("axios");
const CCDError = require("../errors/CCDError");

const createHttpClient = (baseURL) => {
	return axios.create({
		baseURL,
		headers: { "Content-Type": "application/json" },
		timeout: 5000, // 공통 타임아웃 설정 등
	});
};

/**
 * 토큰 기반 인증이 필요한 Axios 클라이언트 생성
 * CloudService에서 사용하던 인터셉터/토큰 갱신 로직을 재사용합니다.
 *
 * @param {string} baseURL
 * @param {{ tokenStorage: import("../../modules/authService/token-storage/TokenStorage").TokenStorage, authService: import("../../modules/authService/AuthService").AuthService }} deps
 */
const createAuthenticatedHttpClient = (baseURL, deps) => {
	const { tokenStorage, authService } = deps;
	const instance = createHttpClient(baseURL);

	let isRefreshing = false;
	/** @type {Array<{ resolve: Function, reject: Function }>} */
	let refreshSubscribers = [];

	const resolveRefreshQueue = (error, token) => {
		while (refreshSubscribers.length) {
			const subscriber = refreshSubscribers.shift();
			if (!subscriber) continue;
			if (error) {
				subscriber.reject(error);
			} else {
				subscriber.resolve(token);
			}
		}
	};

	const handleAuthError = async (error) => {
		const originalRequest = error.config;

		if (error.response?.status !== 401 || originalRequest._retry) {
			return Promise.reject(error);
		}

		originalRequest._retry = true;

		if (isRefreshing) {
			return new Promise((resolve, reject) => {
				refreshSubscribers.push({ resolve, reject });
			})
				.then((token) => {
					originalRequest.headers = originalRequest.headers || {};
					originalRequest.headers.Authorization = `Bearer ${token}`;
					return instance(originalRequest);
				})
				.catch((err) => Promise.reject(err));
		}

		isRefreshing = true;

		try {
			const tokens = await authService.refreshAccessToken();
			resolveRefreshQueue(null, tokens.accessToken);
			originalRequest.headers = originalRequest.headers || {};
			originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;
			return instance(originalRequest);
		} catch (refreshError) {
			resolveRefreshQueue(refreshError);
			await authService.logout();
			throw CCDError.create("E610", {
				module: "AuthenticatedHttpClient",
				context: "토큰 갱신 실패",
				message: "세션이 만료되었습니다. 다시 로그인 해주세요.",
				cause: refreshError,
			});
		} finally {
			isRefreshing = false;
		}
	};

	instance.interceptors.request.use(
		(config) => {
			const token = tokenStorage.getAccessToken();
			if (token) {
				config.headers = config.headers || {};
				config.headers.Authorization = `Bearer ${token}`;
			}
			return config;
		},
		(error) => Promise.reject(error)
	);

	instance.interceptors.response.use(
		(response) => response,
		(error) => handleAuthError(error)
	);

	return instance;
};

module.exports = { createHttpClient, createAuthenticatedHttpClient };

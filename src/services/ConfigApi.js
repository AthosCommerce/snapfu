import fetch from 'node-fetch';

export const API_HOST = 'https://smc-config-api.kube.searchspring.io';
export const ATHOS_API_HOST = 'https://smc-config-api.kube.athoscommerce.io';
export const DEV_API_HOST = 'http://localhost:9999';

export class ConfigApi {
	host = API_HOST;
	userAgent = '';
	secretKey = '';

	constructor(secretKey, options = {}) {
		this.secretKey = secretKey || '';

		if (options.zone === 'athos') {
			this.host = ATHOS_API_HOST;
		}
		if (options.dev) {
			this.host = DEV_API_HOST;
		}
	}

	getHost(siteId = '') {
		if (this.host !== ATHOS_API_HOST && this.host !== DEV_API_HOST && siteId && siteId.startsWith('at')) {
			return ATHOS_API_HOST;
		}
		return this.host;
	}

	async validateSite({ siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/customer/${siteId}/verifyKey`;
		const response = await fetch(apiPath, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'validateSite');
	}

	async getTemplates({ siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/recsTemplates`;

		const response = await fetch(apiPath, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'getTemplates');
	}

	async getBadgeLocations({ siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/badgeLocations`;

		const response = await fetch(apiPath, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'getBadgeLocations');
	}

	async getBadgeTemplates({ siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/badgeTemplates`;

		const response = await fetch(apiPath, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'getBadgeTemplates');
	}

	async putTemplate({ payload, siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/recsTemplate`;

		const response = await fetch(apiPath, {
			method: 'PUT',
			body: JSON.stringify(payload),
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'putTemplate');
	}

	async putBadgeLocations({ payload, siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/badgeLocations`;

		const response = await fetch(apiPath, {
			method: 'PUT',
			body: JSON.stringify(payload),
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'putBadgeLocations');
	}

	async putBadgeTemplate({ payload, siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/badgeTemplate`;

		const response = await fetch(apiPath, {
			method: 'PUT',
			body: JSON.stringify(payload),
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'putBadgeTemplate');
	}

	async archiveTemplate({ payload, siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/recsTemplate`;

		const response = await fetch(apiPath, {
			method: 'DELETE',
			body: JSON.stringify(payload),
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'archiveTemplate', payload);
	}
	async archiveBadgeTemplate({ payload, siteId }) {
		const apiPath = `${this.getHost(siteId)}/api/badgeTemplate`;

		const response = await fetch(apiPath, {
			method: 'DELETE',
			body: JSON.stringify(payload),
			headers: {
				Accept: 'application/json',
				Authorization: this.secretKey,
				'User-Agent': this.userAgent,
			},
		});

		return await this.handleResponse(response, 'archiveBadgeTemplate', payload);
	}

	async handleResponse(response, method, payload = {}) {
		if (response.status == 200) {
			return await response.json();
		} else if (response.status == 401) {
			throw new Error(`Invalid secretKey.`);
		} else if (response.status == 404) {
			if (method === 'archiveBadgeTemplate') {
				throw new Error(`Template '${payload.name}' not found. Ensure correct template name is specified.`);
			} else if (method === 'archiveTemplate') {
				throw new Error(`Template '${payload.name}' not found. Ensure correct branch and template name is specified.`);
			} else if (method === 'validateSite') {
				throw new Error(`Invalid siteid and/or secretKey.`);
			} else {
				throw new Error(`Unhandled 404 error. Please report to Searchspring`);
			}
		} else if (response.status == 405) {
			throw new Error(`Server method not allowed.`);
		} else if (response.status == 409) {
			if (method === 'archiveBadgeTemplate' || method === 'archiveTemplate') {
				// the server explains the conflict, e.g. "template in use by profile: Home Page"
				const text = (await response.text()).trim();
				throw new Error(`Cannot archive ${text}`);
			} else {
				throw new Error(`Unhandled 409 error. Please report to Searchspring`);
			}
		} else if (response.status == 429) {
			const text = (await response.text()).trim();
			throw new Error(`Try again: ${text}`);
		} else if (response.status == 500) {
			throw new Error(`Server encounterd a problem.`);
		} else {
			const message = await response.text();
			if (message) {
				return { message };
			} else {
				throw new Error(`Unhandled response (status ${response.status})`);
			}
		}
	}
}

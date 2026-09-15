import { ConfigApi, API_HOST, DEV_API_HOST, ATHOS_API_HOST } from './ConfigApi';

jest.mock('node-fetch');
import fetch from 'node-fetch';
const { Response } = jest.requireActual('node-fetch');

describe('ConfigApi Class', () => {
	it('can be constructed without any parameters', () => {
		const api = new ConfigApi();

		expect(api).toBeDefined();
		expect(api.host).toBe(API_HOST);
		expect(api.userAgent).toBe('');
		expect(api.secretKey).toBe('');
	});

	it('can be constructed for development usage', () => {
		const api = new ConfigApi('', { dev: true });

		expect(api).toBeDefined();
		expect(api.host).toBe(DEV_API_HOST);
		expect(api.userAgent).toBe('');
		expect(api.secretKey).toBe('');
	});
	it('can be constructed for athos usage', () => {
		const api = new ConfigApi('', { zone: 'athos' });

		expect(api).toBeDefined();
		expect(api.host).toBe(ATHOS_API_HOST);
		expect(api.userAgent).toBe('');
		expect(api.secretKey).toBe('');
	});

	it('prefers the dev host when both dev and athos zone options are set', () => {
		const api = new ConfigApi('', { dev: true, zone: 'athos' });

		expect(api.host).toBe(DEV_API_HOST);
	});

	describe('getHost method', () => {
		it('returns the athos host for at-prefixed siteIds on the default host', () => {
			const api = new ConfigApi('');

			expect(api.getHost('at123')).toBe(ATHOS_API_HOST);
			expect(api.getHost('abc123')).toBe(API_HOST);
			expect(api.getHost()).toBe(API_HOST);
		});

		it('does not redirect at-prefixed siteIds away from the dev host', () => {
			const api = new ConfigApi('', { dev: true });

			expect(api.getHost('at123')).toBe(DEV_API_HOST);
			expect(api.getHost('abc123')).toBe(DEV_API_HOST);
		});

		it('returns the athos host when the athos zone is set', () => {
			const api = new ConfigApi('', { zone: 'athos' });

			expect(api.getHost('at123')).toBe(ATHOS_API_HOST);
			expect(api.getHost('abc123')).toBe(ATHOS_API_HOST);
		});
	});

	it('can be constructed with a secretKey', () => {
		const secretKey = 'secret';
		const api = new ConfigApi(secretKey);

		expect(api).toBeDefined();
		expect(api.host).toBe(API_HOST);
		expect(api.userAgent).toBe('');
		expect(api.secretKey).toBe(secretKey);
	});

	describe('validateSite method', () => {
		it('makes a request for validating a site and returns the response', async () => {
			const mockResponse = '{"credentials": "verified"}';
			fetch.mockReturnValue(Promise.resolve(new Response(mockResponse, { status: 200 })));

			const siteId = 'abc123';
			const secretKey = 'secret';

			const api = new ConfigApi(secretKey, { dev: true });

			const response = await api.validateSite({ siteId });

			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledWith(`${DEV_API_HOST}/api/customer/${siteId}/verifyKey`, {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					Authorization: secretKey,
					'User-Agent': '',
				},
			});

			expect(response).toStrictEqual(JSON.parse(mockResponse));
			fetch.mockRestore();
		});

		it('throws when given responses other than 200', async () => {
			const errorCodes = [400, 401, 404, 405, 429, 500];

			for (const errorCode of errorCodes) {
				fetch.mockReturnValue(Promise.resolve(new Response('', { status: errorCode })));

				const siteName = 'website.com';
				const siteId = 'abc123';
				const secretKey = 'invalidsecret';

				const api = new ConfigApi(secretKey, { dev: true });

				await expect(api.validateSite({ siteId })).rejects.toThrow();
			}

			fetch.mockRestore();
		});

		it('throws a descriptive error for unhandled statuses with empty bodies', async () => {
			fetch.mockReturnValue(Promise.resolve(new Response('', { status: 418 })));

			const api = new ConfigApi('secret', { dev: true });

			await expect(api.validateSite({ siteId: 'abc123' })).rejects.toThrow('Unhandled response (status 418)');

			fetch.mockRestore();
		});

		it('returns the response text as a message for unhandled statuses with bodies', async () => {
			fetch.mockReturnValue(Promise.resolve(new Response('something went wrong', { status: 418 })));

			const api = new ConfigApi('secret', { dev: true });

			const response = await api.validateSite({ siteId: 'abc123' });
			expect(response).toStrictEqual({ message: 'something went wrong' });

			fetch.mockRestore();
		});
	});

	describe('getTemplates method', () => {
		it('makes a request for templates in a site and returns the response', async () => {
			const mockResponse = '{"templates": []}';
			fetch.mockReturnValue(Promise.resolve(new Response(mockResponse, { status: 200 })));

			const siteName = 'website.com';
			const siteId = 'abc123';
			const secretKey = 'secret';

			const api = new ConfigApi(secretKey, { dev: true });

			const response = await api.getTemplates({ siteId });

			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledWith(`${DEV_API_HOST}/api/recsTemplates`, {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					Authorization: secretKey,
					'User-Agent': '',
				},
			});

			expect(response).toStrictEqual(JSON.parse(mockResponse));

			fetch.mockRestore();
		});

		it('throws when given responses other than 200', async () => {
			const errorCodes = [400, 401, 404, 405, 429, 500];

			for (const errorCode of errorCodes) {
				fetch.mockReturnValue(Promise.resolve(new Response('', { status: errorCode })));

				const secretKey = 'invalidsecret';

				const api = new ConfigApi(secretKey, { dev: true });

				await expect(api.getTemplates()).rejects.toThrow();
			}

			fetch.mockRestore();
		});
	});

	describe('putTemplate method', () => {
		it('makes a request for uploading a template for a site', async () => {
			const mockResponse = '{"put": "the template"}';
			fetch.mockReturnValue(Promise.resolve(new Response(mockResponse, { status: 200 })));

			const secretKey = 'secret';

			const api = new ConfigApi(secretKey, { dev: true });

			const payload = {
				name: 'fakename',
				body: 'fakebody',
			};

			const response = await api.putTemplate({ payload });

			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledWith(`${DEV_API_HOST}/api/recsTemplate`, {
				method: 'PUT',
				body: JSON.stringify(payload),
				headers: {
					Accept: 'application/json',
					Authorization: secretKey,
					'User-Agent': '',
				},
			});

			expect(response).toStrictEqual(JSON.parse(mockResponse));

			fetch.mockRestore();
		});

		it('throws when given responses other than 200', async () => {
			const errorCodes = [400, 401, 404, 405, 429, 500];

			for (const errorCode of errorCodes) {
				fetch.mockReturnValue(Promise.resolve(new Response('', { status: errorCode })));

				const secretKey = 'invalidsecret';

				const api = new ConfigApi(secretKey, { dev: true });

				await expect(api.putTemplate()).rejects.toThrow();
			}

			fetch.mockRestore();
		});
	});

	describe('archiveTemplate method', () => {
		it('makes a request for archiving a template for a site', async () => {
			const mockResponse = '{"status": "complete"}';
			fetch.mockReturnValue(Promise.resolve(new Response(mockResponse, { status: 200 })));

			const secretKey = 'secret';

			const api = new ConfigApi(secretKey, { dev: true });

			const payload = {
				name: 'fakename',
				body: 'fakebody',
			};

			const response = await api.archiveTemplate({ payload });

			expect(fetch).toHaveBeenCalledTimes(1);
			expect(fetch).toHaveBeenCalledWith(`${DEV_API_HOST}/api/recsTemplate`, {
				method: 'DELETE',
				body: JSON.stringify(payload),
				headers: {
					Accept: 'application/json',
					Authorization: secretKey,
					'User-Agent': '',
				},
			});

			expect(response).toStrictEqual(JSON.parse(mockResponse));

			fetch.mockRestore();
		});

		it('throws when given responses other than 200', async () => {
			const errorCodes = [400, 401, 404, 405, 409, 429, 500];

			for (const errorCode of errorCodes) {
				fetch.mockReturnValue(Promise.resolve(new Response('', { status: errorCode })));

				const secretKey = 'invalidsecret';

				const api = new ConfigApi(secretKey, { dev: true });

				await expect(api.archiveTemplate()).rejects.toThrow();
			}

			fetch.mockRestore();
		});

		it('names the template and branch when the server responds 404', async () => {
			fetch.mockReturnValue(Promise.resolve(new Response('could not find template with name recs__production\n', { status: 404 })));

			const api = new ConfigApi('secret', { dev: true });

			await expect(api.archiveTemplate({ payload: { name: 'recs', branch: 'production' }, siteId: 'abc123' })).rejects.toThrow(
				"Template 'recs' not found. Ensure correct branch and template name is specified."
			);

			fetch.mockRestore();
		});

		it('surfaces the server conflict message when the template is in use', async () => {
			fetch.mockReturnValue(Promise.resolve(new Response('template in use by profile: Home Page Recs\n', { status: 409 })));

			const api = new ConfigApi('secret', { dev: true });

			await expect(api.archiveTemplate({ payload: { name: 'recs', branch: 'production' }, siteId: 'abc123' })).rejects.toThrow(
				'Cannot archive template in use by profile: Home Page Recs'
			);

			fetch.mockRestore();
		});
	});

	describe('archiveBadgeTemplate method', () => {
		it('names the template when the server responds 404', async () => {
			fetch.mockReturnValue(Promise.resolve(new Response('', { status: 404 })));

			const api = new ConfigApi('secret', { dev: true });

			await expect(api.archiveBadgeTemplate({ payload: { name: 'sale' }, siteId: 'abc123' })).rejects.toThrow(
				"Template 'sale' not found. Ensure correct template name is specified."
			);

			fetch.mockRestore();
		});
	});
});

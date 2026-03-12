import { github, auth } from './login';
import tempDirectory from 'temp-dir';
import fetch from 'node-fetch';
import fs from 'fs-extra';
import fp from 'find-free-port';

let tempDir = '';
let port = -1;

beforeEach(async () => {
	port = await fp(5000).then(([freep]) => {
		return freep;
	});
	tempDir = tempDirectory + '/' + Math.random();
	fs.mkdirsSync(tempDir + '/.athoscommerce');
});

afterEach(() => {
	fs.emptyDirSync(tempDir, (err) => {
		if (err) return console.error(err);
	});
});

describe('listen for callback', () => {
	it('callout', async () => {
		let receivedUrl = auth.listenForCallback(port);
		await fetch(`http://localhost:${port}?user={"name":"bob"}`);
		await receivedUrl.then((resolvedUrl) => {
			expect(resolvedUrl).toEqual('/?user=%7B%22name%22:%22bob%22%7D');
		});
	});
});

describe('create github oauth url', () => {
	function getUrl(dev) {
		let oauthUrl = github.createOauthUrl({ dev });
		return new URL(oauthUrl);
	}
	it('dev mode', () => {
		let url = getUrl(true);
		let params = url.searchParams;
		expect(url.host).toEqual('github.com');
		expect(params.get('scope')).toEqual(github.scopes);
		expect(params.get('client_id')).toEqual('e02c8965ff92aa84b6ee');
		expect(params.get('redirect_uri')).toEqual('http://localhost:3000');
	});
	it('prod mode', () => {
		let url = getUrl(false);
		let params = url.searchParams;
		expect(url.host).toEqual('github.com');
		expect(params.get('scope')).toEqual(github.scopes);
		expect(params.get('client_id')).toEqual('5df635731e7fa3513c1d');
		expect(params.get('redirect_uri')).toEqual('https://token.kube.searchspring.io');
	});
});

describe('save creds', () => {
	it('with user', async () => {
		let url = `http://localhost`;
		await auth.saveCredsFromUrl(url, tempDir);
		expect(fs.pathExistsSync(`${tempDir}/creds.json`)).toEqual(false);
	});
	it('bad user', async () => {
		let url = `http://localhost?user=${escape('{b=c}')}`;
		await auth.saveCredsFromUrl(url, tempDir);
		expect(fs.pathExistsSync(`${tempDir}/creds.json`)).toEqual(false);
	});
	it('without user', async () => {
		let url = `http://localhost?user=${escape(JSON.stringify({ name: 'bob' }))}`;
		await auth.saveCredsFromUrl(url, tempDir);
		let creds = fs.readJsonSync(`${tempDir}/creds.json`);
		expect(creds.name).toEqual('bob');
	});
});

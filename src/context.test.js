import { getClosest, getProject, getContext } from './context';
import tempDirectory from 'temp-dir';
import fs from 'fs-extra';
import path from 'path';
import { promises as fsp } from 'fs';

const mockIndexFile = `// nothing in here`;

const mockPackageJSON = {
	searchspring: {
		siteId: 'ga9kq2',
		framework: 'preact',
		platform: 'bigcommerce',
		tags: ['finder'],
	},
};

let projectDirRoot = '';
let projectDir = '';
let projectDirDeep = '';
let packagePath = '';

beforeAll(async () => {
	// setup project
	projectDirRoot = path.join(tempDirectory, Math.random() + '');
	projectDir = path.join(projectDirRoot, 'workbox/projects/Snapps/secret.project');
	projectDirDeep = path.join(projectDir, 'src/components/Recommendations');

	fs.mkdirsSync(projectDir, true);
	fs.mkdirsSync(projectDirDeep, true);

	packagePath = path.join(projectDir, 'package.json');
	await fsp.writeFile(packagePath, JSON.stringify(mockPackageJSON));
});

afterAll(() => {
	fs.emptyDirSync(projectDirRoot, (err) => {
		if (err) return console.error(err);
	});
});

describe('getClosest function', () => {
	it('throws when it fails to find files', async () => {
		expect(() => {
			getClosest(projectRootDir, 'package.json');
		}).toThrow();
	});

	it('finds the nearest file', async () => {
		const closest = await getClosest(projectDir, 'package.json');
		expect(closest.length).toBe(1);
		expect(closest[0]).toBe(packagePath);
	});

	it('finds the nearest files by traversing up the file tree', async () => {
		const closest = await getClosest(projectDirDeep, 'package.json');
		expect(closest.length).toBe(1);
		expect(closest[0]).toBe(packagePath);
	});
});

describe('getProject function', () => {
	it('returns the parsed json file and adds a "project" attribute', async () => {
		// assumes Javascript when there is no index.ts file found
		const project = await getProject(projectDir);
		const packageJSON = project.packageJSON;
		console.log(packageJSON);
		expect(packageJSON.searchspring).toBeDefined();
		expect(project).toHaveProperty('path');
		expect(project).toHaveProperty('dirname');
		expect(project.dirname).toBe('secret.project');
		expect(project.type).toBe('javascript');
	});

	it('can get javacript type project', async () => {
		// add index.js
		const indexPath = path.join(projectDir, 'src', 'index.js');
		await fsp.writeFile(indexPath, JSON.stringify(mockIndexFile));

		const project = await getProject(projectDir);
		const packageJSON = project.packageJSON;
		expect(packageJSON.searchspring).toBeDefined();
		expect(project).toHaveProperty('path');
		expect(project).toHaveProperty('dirname');
		expect(project.dirname).toBe('secret.project');
		expect(project.type).toBe('javascript');

		await fsp.rm(indexPath);
	});

	it('can get typescript type project', async () => {
		// add index.ts
		const indexPath = path.join(projectDir, 'src', 'index.ts');
		await fsp.writeFile(indexPath, JSON.stringify(mockIndexFile));

		const project = await getProject(projectDir);
		const packageJSON = project.packageJSON;
		expect(packageJSON.searchspring).toBeDefined();
		expect(project).toHaveProperty('path');
		expect(project).toHaveProperty('dirname');
		expect(project.dirname).toBe('secret.project');
		expect(project.type).toBe('typescript');

		// cleanup
		await fsp.rm(indexPath);
	});
});

describe('getContext function', () => {
	it('makes available context data', async () => {
		const context = await getContext(projectDir);
		expect(context).toHaveProperty('project');
		expect(context.project).toHaveProperty('org');
		expect(context.project.org).toBe('searchspring');
		expect(context).toHaveProperty('repository');
		expect(context).toHaveProperty('integration');
		expect(context.project).toHaveProperty('version');
	});
	it('makes available context data for athos siteId', async () => {
		const mockPackageJSON = {
			athos: {
				siteId: 'at1234',
				framework: 'preact',
				platform: 'bigcommerce',
				tags: ['finder'],
			},
		};
		await fsp.writeFile(packagePath, JSON.stringify(mockPackageJSON));

		const context = await getContext(projectDir);
		expect(context).toHaveProperty('project');
		expect(context.project).toHaveProperty('org');
		expect(context.project.org).toBe('athos');
		expect(context).toHaveProperty('repository');
		expect(context).toHaveProperty('integration');
		expect(context.project).toHaveProperty('version');
	});
	it('makes available context data for athos siteId with multiple siteIds', async () => {
		const mockPackageJSON = {
			athos: {
				siteId: {
					at1234: {
						name: 'example1.com',
					},
					at5678: {
						name: 'example2.com',
					},
				},
				framework: 'preact',
				platform: 'bigcommerce',
				tags: ['finder'],
			},
		};
		await fsp.writeFile(packagePath, JSON.stringify(mockPackageJSON));

		const context = await getContext(projectDir);
		expect(context).toHaveProperty('project');
		expect(context.project).toHaveProperty('org');
		expect(context.project.org).toBe('athos');
		expect(context).toHaveProperty('repository');
		expect(context).toHaveProperty('integration');
		expect(context.project).toHaveProperty('version');
	});
});

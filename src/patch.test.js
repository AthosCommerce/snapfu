import { listPatches, applyPatches, getVersions } from './patch.js';
import { setupLibraryRepo } from './library.js';
import { cmp, commandOutput } from './utils/index.js';

import tempDirectory from 'temp-dir';
import fs from 'fs-extra';
import path from 'path';
import { promises as fsp } from 'fs';
import YAML from 'yaml';

const mockPackage = {
	version: '1.2.3',
	searchspring: {
		version: '0.0.1',
		siteId: 'ga9kq2',
		framework: 'preact',
		platform: 'bigcommerce',
		tags: ['finder', 'ac', 'email'],
		nestedObject: {
			hello: 'world',

			deep: {
				search: 'spring',
				helloo: 'woorld',
			},
		},
	},
};

const mockSnapTemplatesPackage = {
	version: '1.2.3',
	searchspring: {
		version: '0.0.1',
		siteId: 'ga9kq2',
		framework: 'preact',
		distribution: 'templates',
		platform: 'shopify',
		tags: ['markets'],
	},
};

const mockPatch = {
	version: 'x.x.x',
	description: 'a mock patch',
	steps: [
		{
			run: 'echo "patching..."',
		},
		{
			files: {
				'package.json': {
					action: 'edit-json',
					changes: [
						{
							update: {
								properties: {
									searchspring: {
										tags: ['patched'],
									},
								},
							},
						},
					],
				},
			},
		},
	],
};

const mockMaintenancePatch = {
	version: 'x.x.x',
	description: 'a mock patch',
	steps: [
		{
			run: 'echo "patching maintenance patch..."',
		},
		{
			files: {
				'package.json': {
					action: 'edit-json',
					changes: [
						{
							update: {
								properties: {
									searchspring: {
										tags: ['maintenance'],
									},
								},
							},
						},
					],
				},
			},
		},
	],
};

const mockSnapPatch = {
	version: 'x.x.x',
	description: 'a mock patch',
	steps: [
		{
			run: 'echo "patching snap only patch..."',
		},
		{
			files: {
				'package.json': {
					action: 'edit-json',
					changes: [
						{
							update: {
								properties: {
									searchspring: {
										tags: ['snap'],
									},
								},
							},
						},
					],
				},
			},
		},
	],
};

const mockSnapTemplatesPatch = {
	version: 'x.x.x',
	description: 'a mock patch',
	steps: [
		{
			run: 'echo "patching snap templates only patch..."',
		},
		{
			files: {
				'package.json': {
					action: 'edit-json',
					changes: [
						{
							update: {
								properties: {
									searchspring: {
										tags: ['snapTemplates'],
									},
								},
							},
						},
					],
				},
			},
		},
	],
};

const mockPatchData = {
	patch: mockPatch,
	maintenance: mockMaintenancePatch,
	snap: mockSnapPatch,
	snapTemplates: mockSnapTemplatesPatch,
};

const mockPatches = {
	preact: ['0.100.0', '0.100.1', '0.100.2', '0.101.0', '0.102.0'],
	react: ['0.1.0', '0.1.2', '0.1.3', '0.1.4', '0.1.5', '0.2.0'],
};

let homeDir = '';
let snapfuDir = '';
let mockPatchesDir = '';
let projectDirRoot = '';
let projectDir = '';
let packageJSONPath = '';

beforeAll(async () => {
	// setup project
	homeDir = path.join(tempDirectory, Math.random() + '');
	snapfuDir = path.join(homeDir, '.athoscommerce');
	mockPatchesDir = path.join(snapfuDir, 'snapfu-mock-patches');
	projectDirRoot = path.join(tempDirectory, Math.random() + '');
	projectDir = path.join(projectDirRoot, 'projects/secret.project');

	// create dirs
	fs.mkdirsSync(projectDir, true);
	fs.mkdirsSync(homeDir, true);
	fs.mkdirsSync(snapfuDir, true);
	fs.mkdirsSync(mockPatchesDir, true);

	packageJSONPath = path.join(projectDir, 'package.json');

	// setup patches mocks
	for (const framework of Object.keys(mockPatches)) {
		for (const version of mockPatches[framework]) {
			const patchDirPath = path.join(mockPatchesDir, 'searchspring', framework, 'patches', version);
			fs.mkdirsSync(patchDirPath, true);

			// create mock patch files for each patch version
			const patchPath = path.join(patchDirPath, `patch.${framework}.${version}.yaml`);
			const patchContents = JSON.parse(JSON.stringify(mockPatch));
			patchContents.version = version;
			await fsp.writeFile(patchPath, YAML.stringify(patchContents));

			// maintenance file
			const maintenancePath = path.join(patchDirPath, `maintenance.${framework}.${version}.yaml`);
			const maintenanceContents = JSON.parse(JSON.stringify(mockMaintenancePatch));
			maintenanceContents.version = version;
			await fsp.writeFile(maintenancePath, YAML.stringify(maintenanceContents));

			// disbribution maintenance files
			const distributions = ['snap', 'snapTemplates'];
			for (let distribution of distributions) {
				const distributionMaintenancePath = path.join(patchDirPath, `maintenance.${framework}.${distribution}.${version}.yaml`);
				const distributionMaintenanceContents = JSON.parse(JSON.stringify(mockPatchData[distribution]));
				distributionMaintenanceContents.version = version;
				await fsp.writeFile(distributionMaintenancePath, YAML.stringify(distributionMaintenanceContents));
			}
		}
	}
});

beforeEach(async () => {
	await fsp.writeFile(packageJSONPath, JSON.stringify(mockPackage));
});

afterAll(() => {
	fs.emptyDirSync(projectDirRoot, (err) => {
		if (err) return console.error(err);
	});
	fs.emptyDirSync(homeDir, (err) => {
		if (err) return console.error(err);
	});
});

describe('setupLibraryRepo function', () => {
	it('can setup library repo', async () => {
		const options = {
			config: {
				snapfuDir: path.join(snapfuDir),
				library: {
					dir: path.join(snapfuDir, 'snapfu-library'),
					repoName: 'snapfu-library',
					repoUrl: 'https://github.com/AthosCommerce/snapfu-library.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework: 'preact',
				},
				project: {
					version: '0.0.1',
					path: projectDir,
				},
			},
			dev: false,
			command: 'patch',
			args: ['list'],
		};

		await setupLibraryRepo(options);

		const directoryContents = fs.statSync(options.config.library.dir);
		expect(directoryContents.isDirectory()).toBe(true);
	});
});

describe('getVersions function', () => {
	it('can get a list of available versions', async () => {
		const framework = 'preact';

		const options = {
			config: {
				snapfuDir: path.join(homeDir, '.athoscommerce'),
				library: {
					dir: mockPatchesDir,
					repoName: 'snapfu-patches',
					repoUrl: 'git@github.com:AthosCommerce/snapfu-patches.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework,
				},
				project: {
					version: '0.0.1',
					path: projectDir,
					org: 'searchspring',
				},
			},
			dev: false,
			command: 'patch',
			args: ['list'],
		};

		const versions = await getVersions(options);
		const sortedMockVersions = mockPatches[framework].sort(cmp);

		expect(versions).toStrictEqual(sortedMockVersions);
	});

	it('can get a list of available versions using starting at', async () => {
		const framework = 'preact';

		const options = {
			config: {
				snapfuDir: path.join(homeDir, '.athoscommerce'),
				library: {
					dir: mockPatchesDir,
					repoName: 'snapfu-patches',
					repoUrl: 'git@github.com:AthosCommerce/snapfu-patches.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework,
				},
				project: {
					version: '0.100.2',
					path: projectDir,
					org: 'searchspring',
				},
			},
			dev: false,
			command: 'patch',
			args: ['list'],
		};

		const versions = await getVersions(options, options.context.project.version);
		const sortedMockVersions = mockPatches[framework].sort(cmp);
		const startVersionIndex = mockPatches[framework].indexOf(options.context.project.version);
		const trimmedMockVersions = sortedMockVersions.slice(startVersionIndex + 1);
		expect(versions).toStrictEqual(trimmedMockVersions);
	});

	it('can get a list of available versions using ending at', async () => {
		const framework = 'preact';

		const options = {
			config: {
				snapfuDir: path.join(homeDir, '.athoscommerce'),
				library: {
					dir: mockPatchesDir,
					repoName: 'snapfu-patches',
					repoUrl: 'git@github.com:AthosCommerce/snapfu-patches.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework,
				},
				project: {
					version: '0.100.2',
					path: projectDir,
					org: 'searchspring',
				},
			},
			dev: false,
			command: 'patch',
			args: ['list'],
		};

		const versions = await getVersions(options, undefined, options.context.project.version);
		const sortedMockVersions = mockPatches[framework].sort(cmp);
		const endVersionIndex = mockPatches[framework].indexOf(options.context.project.version);
		const trimmedMockVersions = sortedMockVersions.slice(0, endVersionIndex + 1);

		expect(versions).toStrictEqual(trimmedMockVersions);
	});

	it('can get a list of available versions using both starting & ending at', async () => {
		const framework = 'preact';

		const options = {
			config: {
				snapfuDir: path.join(homeDir, '.athoscommerce'),
				library: {
					dir: mockPatchesDir,
					repoName: 'snapfu-patches',
					repoUrl: 'git@github.com:AthosCommerce/snapfu-patches.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework,
				},
				project: {
					version: '0.100.2',
					path: projectDir,
					org: 'searchspring',
				},
			},
			dev: false,
			command: 'patch',
			args: ['list'],
		};

		const endVersion = '0.101.0';
		const versions = await getVersions(options, options.context.project.version, endVersion);
		const sortedMockVersions = mockPatches[framework].sort(cmp);
		const startVersionIndex = mockPatches[framework].indexOf(options.context.project.version);
		const endVersionIndex = mockPatches[framework].indexOf(endVersion);
		const trimmedMockVersions = sortedMockVersions.slice(startVersionIndex + 1, endVersionIndex + 1);

		expect(versions).toStrictEqual(trimmedMockVersions);
	});
});

describe('listPatches', () => {
	it('can list patches', async () => {
		const logHistory = [];
		const consoleMock = jest.spyOn(global.console, 'log').mockImplementation((...args) => {
			logHistory.push(args[0]);
		});

		const options = {
			config: {
				snapfuDir: path.join(homeDir, '.athoscommerce'),
				library: {
					dir: mockPatchesDir,
					repoName: 'snapfu-patches',
					repoUrl: 'git@github.com:AthosCommerce/snapfu-patches.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework: 'preact',
				},
				project: {
					version: '0.0.1',
					path: projectDir,
					org: 'searchspring',
				},
			},
			options: {
				ci: true,
			},
			dev: false,
			command: 'patch',
			args: ['list'],
		};

		await listPatches(options, true);

		mockPatches.preact.forEach((version) => {
			expect(logHistory.includes(version)).toBe(true);
		});

		consoleMock.mockRestore();
	});
});

describe('applyPatches', () => {
	it('can apply a single patch of a release', async () => {
		const logHistory = [];
		const consoleMock = jest.spyOn(global.console, 'log').mockImplementation((...args) => {
			logHistory.push(args[0]);
		});

		const version = '0.100.0';

		const options = {
			config: {
				snapfuDir: path.join(homeDir, '.athoscommerce'),
				library: {
					dir: mockPatchesDir,
					repoName: 'snapfu-patches',
					repoUrl: 'git@github.com:searchspring/snapfu-patches.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework: 'preact',
				},
				project: {
					version: '0.0.1',
					path: projectDir,
					org: 'searchspring',
				},
			},
			options: {
				ci: true,
			},
			dev: false,
			command: 'patch',
			args: ['apply', version],
		};

		await applyPatches(options, true);

		const contents = await fsp.readFile(packageJSONPath, 'utf8');
		const parsed = JSON.parse(contents);
		expect(parsed.searchspring.tags).toStrictEqual([...mockPackage.searchspring.tags, 'maintenance', 'snap', 'patched']);
		expect(parsed.searchspring.version).toBe(version);
		expect(logHistory.includes('patching...\n')).toBe(true);

		consoleMock.mockRestore();
	});

	it('can apply patches to latest', async () => {
		const options = {
			config: {
				snapfuDir: path.join(homeDir, '.athoscommerce'),
				library: {
					dir: mockPatchesDir,
					repoName: 'snapfu-patches',
					repoUrl: 'git@github.com:AthosCommerce/snapfu-patches.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework: 'preact',
				},
				project: {
					version: '0.0.1',
					path: projectDir,
					org: 'searchspring',
				},
			},
			options: {
				ci: true,
			},
			dev: false,
			command: 'patch',
			args: ['apply', 'latest'],
		};

		await applyPatches(options, true);
		const contents = await fsp.readFile(packageJSONPath, 'utf8');
		const parsed = JSON.parse(contents);

		expect(parsed.searchspring.tags).toStrictEqual([
			...mockPackage.searchspring.tags,
			...mockPatches.preact.flatMap((p) => ['maintenance', 'snap', 'patched']),
		]);
		expect(parsed.searchspring.version).toBe(mockPatches.preact[mockPatches.preact.length - 1]);
	});

	it('will apply distribution specific maintenance', async () => {
		// modify package json for templates project
		packageJSONPath = path.join(projectDir, 'package.json');
		await fsp.writeFile(packageJSONPath, JSON.stringify(mockSnapTemplatesPackage));

		const options = {
			config: {
				snapfuDir: path.join(homeDir, '.athoscommerce'),
				library: {
					dir: mockPatchesDir,
					repoName: 'snapfu-patches',
					repoUrl: 'git@github.com:AthosCommerce/snapfu-patches.git',
				},
			},
			context: {
				integration: {
					siteId: 'abc123',
					framework: 'preact',
					distribution: 'templates',
				},
				project: {
					version: '0.0.1',
					path: projectDir,
					org: 'searchspring',
				},
			},
			options: {
				ci: true,
			},
			dev: false,
			command: 'patch',
			args: ['apply', 'latest'],
		};

		await applyPatches(options, true);
		const contents = await fsp.readFile(packageJSONPath, 'utf8');
		const parsed = JSON.parse(contents);

		expect(parsed.searchspring.tags).toStrictEqual([
			...mockSnapTemplatesPackage.searchspring.tags,
			...mockPatches.preact.flatMap((p) => ['maintenance', 'snapTemplates', 'patched']),
		]);
		expect(parsed.searchspring.version).toBe(mockPatches.preact[mockPatches.preact.length - 1]);
	});
});

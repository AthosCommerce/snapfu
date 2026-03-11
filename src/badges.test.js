import { pascalCase } from './utils/index.js';
import {
	ROOT_LOCATIONS,
	buildBadgeTemplatePayload,
	buildBadgeLocationsPayload,
	findJsonFiles,
	readTemplateSettings,
	writeTemplateFile,
	getTemplates,
	getLocationsFile,
	generateTemplateSettings,
	validateTemplate,
	validateLocations,
} from './badges';
import tempDirectory from 'temp-dir';
import fs from 'fs-extra';
import path from 'path';
import { promises as fsp } from 'fs';

const mockPackageJSON = {
	searchspring: {
		siteId: 'ga9kq2',
		framework: 'preact',
		platform: 'bigcommerce',
		tags: ['finder'],
	},
};

const mockLocations = {
	left: [{ tag: 'left', name: 'Left Location' }],
	right: [{ tag: 'right', name: 'Right Location' }],
	callout: [{ tag: 'callout', name: 'Callout Location' }],
};
const mockLocationsSettings = {
	type: 'snap/badge/locations',
	...mockLocations,
};

const mockTemplateSettings = {
	type: 'snap/badge/default',
	name: 'customBadge',
	label: 'Custom Badge',
	description: 'custom badge template',
	component: 'CustomBadge',
	locations: ['left', 'right', 'callout'],
	value: {
		enabled: true,
	},
	parameters: [
		{
			name: 'rgba_color',
			type: 'color',
			label: 'rgba_color',
			description: 'rgba color',
			defaultValue: 'rgba(5, 52, 53, 0)',
		},
		{
			name: 'integer',
			type: 'integer',
			label: 'integer',
			description: 'enter a whole number',
			defaultValue: '123',
			validations: {
				min: 1,
				max: 200,
			},
		},
	],
};

const mockCreds = { login: 'mylogin', name: 'myname', token: 'xyz' };

let homeDir = '';
let projectDirRoot = '';
let projectDir = '';
let projectDirBadges = '';
let packagePath = '';
let badgesSettings1Path = '';
let badgesSettings2Path = '';
let badgesSettings3Path = '';
let badgesSettings4Path = '';
let badgesLocationsPath = '';

beforeAll(async () => {
	// setup creds
	homeDir = path.join(tempDirectory, Math.random() + '');
	fs.mkdirsSync(path.join(homeDir, '.athoscommerce'));
	await fsp.writeFile(path.join(homeDir, '.athoscommerce/creds.json'), JSON.stringify(mockCreds));

	// setup project
	projectDirRoot = path.join(tempDirectory, Math.random() + '');
	projectDir = path.join(projectDirRoot, 'workbox/projects/Snapps/secret.project');
	projectDirBadges = path.join(projectDir, 'src/components/Badges');

	fs.mkdirsSync(projectDir, true);
	fs.mkdirsSync(projectDirBadges, true);

	packagePath = path.join(projectDir, 'package.json');
	await fsp.writeFile(packagePath, JSON.stringify(mockPackageJSON));

	badgesSettings1Path = path.join(projectDirBadges, 'Badge1.json');
	badgesSettings2Path = path.join(projectDirBadges, 'Badge2.json');
	badgesSettings3Path = path.join(projectDirBadges, 'Badge3.json');
	badgesSettings4Path = path.join(projectDir, 'Badge4.json');
	badgesLocationsPath = path.join(projectDirBadges, 'locations.json');

	await fsp.writeFile(badgesSettings1Path, JSON.stringify(mockTemplateSettings));
	await fsp.writeFile(badgesSettings2Path, JSON.stringify(mockTemplateSettings));
	await fsp.writeFile(badgesSettings3Path, JSON.stringify({}));
	await fsp.writeFile(badgesSettings4Path, JSON.stringify(mockTemplateSettings));
	await fsp.writeFile(badgesLocationsPath, JSON.stringify(mockLocationsSettings));
});

afterAll(() => {
	fs.emptyDirSync(homeDir, (err) => {
		if (err) return console.error(err);
	});

	fs.emptyDirSync(projectDirRoot, (err) => {
		if (err) return console.error(err);
	});
});

describe('validateLocations function', () => {
	it('valid locations', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log');

		const locations = {
			details: mockLocationsSettings,
		};
		const result = validateLocations(locations);
		expect(result).toBe(true);

		expect(mockConsoleLog).toHaveBeenCalledTimes(0);
		mockConsoleLog.mockRestore();
	});

	it('invalid locations', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log');
		const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => {
			throw new Error('process.exit: ' + number);
		});

		const locations = {
			details: {
				...mockLocationsSettings,
			},
		};
		delete locations.details.left;

		expect(async () => {
			validateLocations(locations);
		}).rejects.toThrow();

		expect(mockConsoleLog).toHaveBeenCalledTimes(4);
		mockConsoleLog.mockRestore();

		expect(mockExit).toHaveBeenCalledWith(1);
		mockExit.mockRestore();
	});
});

describe('validateTemplate function', () => {
	it('valid template', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log');

		const template = {
			details: mockTemplateSettings,
		};
		const result = validateTemplate(template, JSON.stringify(mockLocations));
		expect(result).toBe(true);

		expect(mockConsoleLog).toHaveBeenCalledTimes(0);
		mockConsoleLog.mockRestore();
	});

	it('valid template with locations', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log');

		const template = {
			details: mockTemplateSettings,
		};

		const result = validateTemplate(template, JSON.stringify(mockLocationsSettings));
		expect(result).toBe(true);

		expect(mockConsoleLog).toHaveBeenCalledTimes(0);
		mockConsoleLog.mockRestore();
	});

	it('invalid template - missing required keys', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log');
		const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => {
			throw new Error('process.exit: ' + number);
		});

		const template = {
			details: {
				...mockTemplateSettings,
			},
		};
		const toDelete = ['type', 'name', 'label', 'component', 'locations'];
		toDelete.forEach((key) => {
			delete template.details[key];
		});

		expect(async () => {
			validateTemplate(template);
		}).rejects.toThrow();

		expect(mockConsoleLog).toHaveBeenCalledTimes(2 + toDelete.length);
		mockConsoleLog.mockRestore();

		expect(mockExit).toHaveBeenCalledWith(1);
		mockExit.mockRestore();
	});

	it('invalid template - invalid types', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log');
		const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => {
			throw new Error('process.exit: ' + number);
		});

		const invalidOverrides = {
			name: 'nonAlph@Numer!c', // should be alphanumeric
			label: 123, // must be a string
			description: 123, // must be a string
			component: 123, // must be a string
			locations: 123, // must be an array
			value: 123, // must be an object
			parameters: 123, // must be an array
			unknown: 123, // unknown key
		};
		const template = {
			details: {
				...mockTemplateSettings,
				...invalidOverrides,
			},
		};

		expect(async () => {
			validateTemplate(template);
		}).rejects.toThrow();

		expect(mockConsoleLog).toHaveBeenCalledTimes(2 + Object.keys(invalidOverrides).length);
		mockConsoleLog.mockRestore();

		expect(mockExit).toHaveBeenCalledWith(1);
		mockExit.mockRestore();
	});
});

describe('generateTemplateSettings function', () => {
	it('returns a stringified object with template settings', async () => {
		const name = 'Newness';
		const description = 'details and stuff';
		const type = 'snap/badge/default';
		const settingsString = generateTemplateSettings({ name, description, type });
		expect(settingsString).toBeDefined();

		const settings = JSON.parse(settingsString);
		expect(settings).toHaveProperty('type');
		expect(settings).toHaveProperty('name', name.toLowerCase());
		expect(settings).toHaveProperty('label', `${pascalCase(name)} Badge`);
		expect(settings).toHaveProperty('description');
		expect(settings).toHaveProperty('component', pascalCase(name));
		expect(settings).toHaveProperty('locations');
		expect(settings).toHaveProperty('value');
		expect(settings).toHaveProperty('parameters');
	});
});

describe('getTemplates function', () => {
	it('returns an empty array on error', async () => {
		const files = await getTemplates('some/place');
		expect(files).toStrictEqual([]);
	});

	it('returns an array of template objects with properties', async () => {
		const files = await getTemplates(projectDirRoot);
		expect.assertions(files.length * 2);
		files.forEach((file) => {
			expect(file).toHaveProperty('path');
			expect(file).toHaveProperty('details');
		});
	});

	it('filters out json files that are not valid template settings', async () => {
		const files = await getTemplates(projectDirRoot);
		expect(files.length).toBe(3);
	});
});

describe('getLocationsFile function', () => {
	it('returns locations file', async () => {
		const file = await getLocationsFile(projectDirRoot);
		expect(file).toHaveProperty('path');
		expect(file).toHaveProperty('details');
		expect(file.details).toStrictEqual(mockLocationsSettings);
	});
});

describe('writeTemplateFile function', () => {
	it('will not write to existing file', async () => {
		const newSettings = {
			name: 'not allowed',
		};

		const contents = await readTemplateSettings(badgesSettings1Path);
		expect(contents).toStrictEqual(mockTemplateSettings);
		await writeTemplateFile(badgesSettings1Path, JSON.stringify(newSettings));
		const overwrittenContents = await readTemplateSettings(badgesSettings1Path);
		expect(overwrittenContents).not.toStrictEqual(newSettings);
		expect(overwrittenContents).toStrictEqual(mockTemplateSettings);
	});

	it('writes to files that do not exist', async () => {
		const newSettings = {
			name: 'not allowed',
		};

		const newSettingsPath = path.join(projectDirBadges, 'newSettings.json');
		await writeTemplateFile(newSettingsPath, JSON.stringify(newSettings));
		const contents = await readTemplateSettings(newSettingsPath);
		expect(contents).toStrictEqual(newSettings);
	});
});

describe('readTemplateSettings function', () => {
	it('returns empty when invalid file path provided', async () => {
		const contents = await readTemplateSettings('some/path');
		expect(contents).toStrictEqual({});
	});

	it('returns contents of json file', async () => {
		const contents = await readTemplateSettings(badgesSettings1Path);
		expect(contents).toStrictEqual(mockTemplateSettings);
	});
});

describe('findJsonFiles function', () => {
	it('expects a directory as the first parameter', async () => {
		expect(async () => {
			const files = await findJsonFiles('some/place');
		}).rejects.toThrow();
	});

	it('looks for json files', async () => {
		const files = await findJsonFiles(projectDirRoot);

		expect(files.length).toBe(7);
	});
});

describe('buildBadgeLocationsPayload function', () => {
	it('returns an object with expected locations', async () => {
		const payload = buildBadgeLocationsPayload(mockLocationsSettings);
		expect(payload).toStrictEqual(mockLocations);
	});

	it('returns an object with root locations', async () => {
		const locations = Object.keys(mockLocations);
		// if this fails, mockLocationsSettings needs to be updated
		expect(locations).toStrictEqual(ROOT_LOCATIONS);

		const payload = buildBadgeLocationsPayload(mockLocationsSettings);
		expect(payload).toStrictEqual(mockLocations);
	});

	it('only returns an object with root locations (ignore unsupported locations)', async () => {
		const locations = {
			...mockLocationsSettings,
			callout2: [{ tag: 'callout2', name: 'Callout2 Location' }],
		};
		const payload = buildBadgeLocationsPayload(locations);
		expect(payload).toStrictEqual(mockLocations);
	});
});

describe('buildBadgeTemplatePayload function', () => {
	it('returns an object with expected template', async () => {
		const payload = buildBadgeTemplatePayload(mockTemplateSettings);
		expect(payload).toStrictEqual(mockTemplateSettings);
	});
	it('returns an object with defaults', async () => {
		const template = {
			...mockTemplateSettings,
		};
		delete template.label;
		delete template.description;
		delete template.value;

		const payload = buildBadgeTemplatePayload(template);
		expect(payload).toStrictEqual({
			...mockTemplateSettings,
			label: `${pascalCase(template.name)} Badge`,
			description: `${template.name} custom template`,
			value: {
				enabled: true,
			},
		});
	});
});

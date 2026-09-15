import {
	buildTemplatePayload,
	findJsonFiles,
	readTemplateSettings,
	writeTemplateFile,
	getTemplates,
	generateTemplateSettings,
	validateTemplate,
} from './recs';
import { pascalCase } from './utils/index.js';
import tempDirectory from 'temp-dir';
import fs from 'fs-extra';
import path from 'path';
import { promises as fsp, write } from 'fs';

const mockPackageJSON = {
	searchspring: {
		siteId: 'ga9kq2',
		framework: 'preact',
		platform: 'bigcommerce',
		tags: ['finder'],
	},
};

const mockTemplateSettings = {
	type: 'snap/recommendation',
	name: 'thing',
	label: 'thing',
	description: 'thing custom template.',
	component: 'Thing',
	orientation: 'horizontal',
	parameters: [
		{
			name: 'title',
			label: 'Title',
			description: 'text used for the heading',
			defaultValue: 'Recommended Products',
		},
	],
};

const mockCreds = { login: 'mylogin', name: 'myname', token: 'xyz' };

let homeDir = '';
let projectDirRoot = '';
let projectDir = '';
let projectDirRecs = '';
let packagePath = '';
let recsSettings1Path = '';
let recsSettings2Path = '';
let recsSettings3Path = '';
let recsSettings4Path = '';

beforeAll(async () => {
	// setup creds
	homeDir = path.join(tempDirectory, Math.random() + '');
	fs.mkdirsSync(path.join(homeDir, '.athoscommerce'));
	await fsp.writeFile(path.join(homeDir, '.athoscommerce/creds.json'), JSON.stringify(mockCreds));

	// setup project
	projectDirRoot = path.join(tempDirectory, Math.random() + '');
	projectDir = path.join(projectDirRoot, 'workbox/projects/Snapps/secret.project');
	projectDirRecs = path.join(projectDir, 'src/components/Recommendations');

	fs.mkdirsSync(projectDir, true);
	fs.mkdirsSync(projectDirRecs, true);

	packagePath = path.join(projectDir, 'package.json');
	await fsp.writeFile(packagePath, JSON.stringify(mockPackageJSON));

	recsSettings1Path = path.join(projectDirRecs, 'Recs1.json');
	recsSettings2Path = path.join(projectDirRecs, 'Recs2.json');
	recsSettings3Path = path.join(projectDirRecs, 'Recs3.json');
	recsSettings4Path = path.join(projectDir, 'Recs4.json');

	await fsp.writeFile(recsSettings1Path, JSON.stringify(mockTemplateSettings));
	await fsp.writeFile(recsSettings2Path, JSON.stringify(mockTemplateSettings));
	await fsp.writeFile(recsSettings3Path, JSON.stringify({}));
	await fsp.writeFile(recsSettings4Path, JSON.stringify(mockTemplateSettings));
});

afterAll(() => {
	fs.emptyDirSync(homeDir, (err) => {
		if (err) return console.error(err);
	});

	fs.emptyDirSync(projectDirRoot, (err) => {
		if (err) return console.error(err);
	});
});

describe('generateTemplateSettings function', () => {
	it('returns a stringified object with template settings', async () => {
		const name = 'Newness';
		const description = 'details and stuff';
		const type = 'snap/recommendation/default';
		const settingsString = generateTemplateSettings({ name, description, type });
		expect(settingsString).toBeDefined();

		const settings = JSON.parse(settingsString);
		expect(settings).toHaveProperty('name', name.toLowerCase());
		expect(settings).toHaveProperty('label', name);
		expect(settings).toHaveProperty('description');
		expect(settings).toHaveProperty('component', pascalCase(name));
		expect(settings).toHaveProperty('orientation');
		expect(settings).toHaveProperty('parameters');
		expect(settings).toHaveProperty('version', '2');
		settings.parameters.forEach((parameter) => {
			expect(parameter).toHaveProperty('type');
		});
	});

	it('returns a correct properties if email type', async () => {
		const name = 'Newness';
		const description = 'details and stuff';
		const type = 'snap/recommendation/email';
		const settingsString = generateTemplateSettings({ name, description, type });
		expect(settingsString).toBeDefined();

		const settings = JSON.parse(settingsString);
		expect(settings).toHaveProperty('name', name.toLowerCase());
		expect(settings).toHaveProperty('label', name);
		expect(settings).toHaveProperty('description');
		expect(settings).toHaveProperty('component', pascalCase(name));
		expect(settings).not.toHaveProperty('orientation');
		expect(settings).not.toHaveProperty('parameters');
	});
});

describe('getTemplates function', () => {
	it('returns an empty array on error', async () => {
		const files = await getTemplates('some/place');
		expect(files).toStrictEqual([]);
	});

	it('returns an array of template objects with properties', async () => {
		const files = await getTemplates(projectDirRoot);
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

describe('writeTemplateFile function', () => {
	it('will not write to existing file', async () => {
		const newSettings = {
			name: 'not allowed',
		};

		const contents = await readTemplateSettings(recsSettings1Path);
		expect(contents).toStrictEqual(mockTemplateSettings);
		await writeTemplateFile(recsSettings1Path, JSON.stringify(newSettings));
		const overwrittenContents = await readTemplateSettings(recsSettings1Path);
		expect(overwrittenContents).not.toStrictEqual(newSettings);
		expect(overwrittenContents).toStrictEqual(mockTemplateSettings);
	});

	it('writes to files that do not exist', async () => {
		const newSettings = {
			name: 'not allowed',
		};

		const newSettingsPath = path.join(projectDirRecs, 'newSettings.json');
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
		const contents = await readTemplateSettings(recsSettings1Path);
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

		expect(files.length).toBe(6);
	});
});

describe('buildTemplatePayload function', () => {
	it('transforms a template settings into API payload', async () => {
		const vars = { branch: 'my-branch', framework: 'preact' };

		const transformed = buildTemplatePayload(mockTemplateSettings, vars);
		expect(transformed).toHaveProperty('name');
		expect(transformed).toHaveProperty('component');
		expect(transformed).toHaveProperty('meta');
		expect(transformed).toHaveProperty('parameters');
		expect(transformed).not.toHaveProperty('version');
	});

	it('includes version in the payload when the template specifies one', async () => {
		const vars = { branch: 'my-branch', framework: 'preact' };

		const transformed = buildTemplatePayload({ ...mockTemplateSettings, version: '2' }, vars);
		expect(transformed).toHaveProperty('version', '2');
	});

	it('uses the project distribution for the template type', async () => {
		const snapVars = { branch: 'my-branch', framework: 'preact', distribution: 'Snap' };
		const snapPayload = buildTemplatePayload(mockTemplateSettings, snapVars);
		expect(snapPayload.meta.searchspringTemplate.type).toBe('snap');

		const templatesVars = { branch: 'my-branch', framework: 'preact', distribution: 'SnapTemplates' };
		const templatesPayload = buildTemplatePayload(mockTemplateSettings, templatesVars);
		expect(templatesPayload.meta.searchspringTemplate.type).toBe('snaptemplates');
	});

	it('defaults the template type to snap when no distribution is provided', async () => {
		const vars = { branch: 'my-branch', framework: 'preact' };
		const transformed = buildTemplatePayload(mockTemplateSettings, vars);
		expect(transformed.meta.searchspringTemplate.type).toBe('snap');
	});
});

describe('validateTemplate function', () => {
	const mockVersionedTemplateSettings = {
		...mockTemplateSettings,
		version: '2',
		parameters: [
			{
				name: 'title',
				type: 'string',
				label: 'Title',
				description: 'text used for the heading',
				defaultValue: 'Recommended Products',
				validations: {
					min: 1,
					max: 50,
				},
			},
			{
				name: 'layout',
				type: 'array',
				label: 'Layout',
				description: 'layout of the results',
				defaultValue: 'carousel',
				options: ['carousel', 'grid'],
			},
		],
	};

	it('valid template without version and untyped parameters', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

		const template = {
			details: mockTemplateSettings,
		};
		const result = validateTemplate(template);
		expect(result).toBe(true);

		expect(mockConsoleLog).toHaveBeenCalledTimes(0);
		mockConsoleLog.mockRestore();
	});

	it('valid template with version and typed parameters', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});

		const template = {
			details: mockVersionedTemplateSettings,
		};
		const result = validateTemplate(template);
		expect(result).toBe(true);

		expect(mockConsoleLog).toHaveBeenCalledTimes(0);
		mockConsoleLog.mockRestore();
	});

	it('invalid template - missing required keys', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
		const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => {
			throw new Error('process.exit: ' + number);
		});

		const template = {
			details: {
				...mockTemplateSettings,
			},
		};
		const toDelete = ['type', 'name', 'label', 'component'];
		toDelete.forEach((key) => {
			delete template.details[key];
		});

		expect(() => {
			validateTemplate(template);
		}).toThrow();

		expect(mockConsoleLog).toHaveBeenCalledTimes(2 + toDelete.length);
		toDelete.forEach((key) => {
			expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(`template paramater '${key}' is required`));
		});
		mockConsoleLog.mockRestore();

		expect(mockExit).toHaveBeenCalledWith(1);
		mockExit.mockRestore();
	});

	it('invalid template - invalid types', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
		const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => {
			throw new Error('process.exit: ' + number);
		});

		const invalidOverrides = {
			name: 'nonAlph@Numer!c', // should be alphanumeric
			label: 123, // must be a string
			description: 123, // must be a string
			component: 123, // must be a string
			orientation: 123, // must be a string
			version: 123, // must be a string
			parameters: 123, // must be an array
			unknown: 123, // unknown key
		};
		const template = {
			details: {
				...mockTemplateSettings,
				...invalidOverrides,
			},
		};

		expect(() => {
			validateTemplate(template);
		}).toThrow();

		expect(mockConsoleLog).toHaveBeenCalledTimes(2 + Object.keys(invalidOverrides).length);
		expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(`template paramater 'name' must be an alphanumeric string`));
		expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(`template paramater 'parameters' must be an array`));
		expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(`unknown template parameter 'unknown' should be removed`));
		mockConsoleLog.mockRestore();

		expect(mockExit).toHaveBeenCalledWith(1);
		mockExit.mockRestore();
	});

	it('invalid template - parameter type required when version provided', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
		const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => {
			throw new Error('process.exit: ' + number);
		});

		const template = {
			details: {
				...mockTemplateSettings,
				version: '2',
			},
		};

		expect(() => {
			validateTemplate(template);
		}).toThrow();

		// two logs for the error header, one for the missing type parameter
		expect(mockConsoleLog).toHaveBeenCalledTimes(3);
		expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining(`template paramater 'parameters[0].type' is required`));
		mockConsoleLog.mockRestore();

		expect(mockExit).toHaveBeenCalledWith(1);
		mockExit.mockRestore();
	});

	it('invalid template - parameter validation matches badges', async () => {
		const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
		const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => {
			throw new Error('process.exit: ' + number);
		});

		const template = {
			details: {
				...mockVersionedTemplateSettings,
				parameters: [
					{
						name: 'layout',
						type: 'array',
						label: 'Layout',
						description: 'layout of the results',
						defaultValue: 'blah', // not one of the options
						options: ['carousel', 'grid'],
					},
				],
			},
		};

		expect(() => {
			validateTemplate(template);
		}).toThrow();

		// two logs for the error header, one for the invalid defaultValue
		expect(mockConsoleLog).toHaveBeenCalledTimes(3);
		expect(mockConsoleLog).toHaveBeenCalledWith(
			expect.stringContaining(`template paramater 'parameters[0].defaultValue' must be one of the options in 'options' array`)
		);
		mockConsoleLog.mockRestore();

		expect(mockExit).toHaveBeenCalledWith(1);
		mockExit.mockRestore();
	});
});

describe('pascalCase function', () => {
	it('sets the first character to uppercase', async () => {
		const uppered = pascalCase('testString');
		expect(uppered).toBe('TestString');
	});
});

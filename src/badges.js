import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs, { promises as fsp } from 'fs';
import { exit } from 'process';
import { wait, copy, copyTransform, pascalCase, handleize } from './utils/index.js';
import { ConfigApi } from './services/ConfigApi.js';
import { buildLibrary } from './library.js';
import { deepStrictEqual } from 'assert';

const TEMPLATE_TYPE_BADGES = 'snap/badge';
const DIR_EXCLUDE_LIST = ['node_modules', '.git'];
const LOCATIONS_FILE = 'locations.json';
export const ROOT_LOCATIONS = ['left', 'right', 'callout'];

export async function initBadgeTemplate(options) {
	const { context } = options;
	const { integration } = context;
	const [command, ...nameArgs] = options.args;
	const nameArg = nameArgs.join(' ');

	if (!integration || !context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		return;
	}

	// fetch library contents
	const library = await buildLibrary(options);

	if (!integration.framework || !library[integration.framework]) {
		console.log(chalk.red(`Error: No path specified and unknown Snap framework.`));
		return;
	}

	if (nameArg && nameArg.length < 3) {
		console.log(chalk.red(`Error: Template name must be greater than two characters in length.`));
		return;
	}

	const framework = library[integration.framework];

	if (!framework?.components?.badge) {
		console.log(chalk.red(`Error: Library does not contain badge components.`));
		return;
	}

	const templateDefaultDir = path.resolve(context.project.path, options.config.directories.components.badge);
	const answers1 = await inquirer.prompt([
		{
			type: 'list',
			name: 'type',
			message: 'Please select the type of badge:',
			choices: Object.keys(framework.components.badge),
			default: 'default',
		},
	]);

	const type = answers1.type;
	const componentOptions = library[integration.framework].components.badge[type];
	let answers2;
	const keys = Object.keys(componentOptions);
	if (keys.length > 1) {
		answers2 = await inquirer.prompt([
			{
				type: 'list',
				name: 'badgeType',
				message: `Please select the type of ${type} badge component to use:`,
				choices: Object.keys(componentOptions),
				default: 'default',
			},
		]);
	} else {
		answers2 = { badgeType: keys[0] };
	}

	let answers3;
	if (!nameArg) {
		answers3 = await inquirer.prompt([
			{
				type: 'input',
				name: 'name',
				message: 'Please enter the name of the template:',
				validate: (input) => {
					return input && input.length > 2;
				},
			},
		]);
	}

	const name = nameArg || answers3.name;
	const componentName = pascalCase(name);

	const answers4 = await inquirer.prompt([
		{
			type: 'input',
			name: 'description',
			message: 'Please enter a description for the template:',
		},
		{
			type: 'input',
			name: 'directory',
			message: 'Please specify the path to initialize the template files (relative to project directory):',
			validate: (input) => {
				return input && input.length > 0;
			},
			default: path.join(options.config.directories.components.badge, componentName),
		},
	]);

	console.log(`\nInitializing template...`);

	const answers = { ...answers1, ...answers2, ...answers3, ...answers4 };

	const description = answers && answers.description;
	const templateDir = (answers && answers.directory) || templateDefaultDir;

	try {
		// copy over files for new component
		const component = framework.components.badge[answers.type][answers.badgeType];
		if (component || !component.path || !component.files?.length) {
			// create component template JSON descriptor file
			await writeTemplateFile(
				path.resolve(context.project.path, templateDir, `${componentName}.json`),
				generateTemplateSettings({ name, description, type: `${TEMPLATE_TYPE_BADGES}/${answers.type}` })
			);

			let options = { clobber: false };
			const variables = {
				'snapfu.variables.name': name,
				'snapfu.variables.component': componentName,
				'snapfu.variables.class': handleize(name),
			};

			options.transform = async (read, write, file) => {
				await copyTransform(read, write, variables, file);
			};

			// filter out files only in list
			options.filter = (name) => {
				const fileDetails = path.parse(name);
				if (fileDetails.ext) {
					// if file has an extension check if it is in the component file list - list will exclude language (eg. js/ts) based on context
					return component.files.includes(fileDetails.base);
				} else {
					// directory
					return true;
				}
			};

			// rename files
			options.rename = (name) => {
				let filePath;
				const fileDetails = path.parse(name);

				if (fileDetails.ext && fileDetails.name.toLowerCase() == answers.badgeType.toLowerCase()) {
					// rename the file if it is not a directory AND it has a name matching the directory name (eg. default)
					fileDetails.name = componentName;
					delete fileDetails.base; // needed so that path.format utilizes name and ext
					const newName = path.format(fileDetails);

					filePath = newName;
				} else {
					filePath = name;
				}

				// logging for wether we create or not
				fs.stat(filePath, (exists) => {
					if (!exists) {
						console.log(chalk.yellow(`File already exists: ${filePath}`));
					} else {
						console.log(chalk.green(`Creating file: ${filePath}`));
					}
				});

				return filePath;
			};

			const projectComponentDirectory = path.resolve(context.project.path, templateDir);

			await copy(component.path, projectComponentDirectory, options);
		} else {
			throw `Component "${componentName}" in library is corrupt!`;
		}
	} catch (err) {
		console.log(chalk.red(`Error: Failed to initialize template.`));
		console.log(err);
	}
}

export async function listBadgeTemplates(options) {
	const { context } = options;
	const { integration, repository } = context;
	const [command, location] = options.args;

	if (!integration || !context.project || !context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		return;
	}

	if (!location || location == 'local') {
		console.log(`${chalk.whiteBright(`Local Templates`)}`);

		// look for templates, but only in the ./src directory
		const templates = await getTemplates(path.join(context.project.path, 'src'));

		if (!templates || !templates.length) {
			console.log(chalk.italic('        no templates found...'));
		} else {
			console.log(`    ${chalk.white(`Badge Templates`)}`);

			const maxLengthName = templates.reduce((max, template) => {
				return template.details.name.length > max ? template.details.name.length : max;
			}, 0);
			const maxLengthLabel = templates.reduce((max, template) => {
				return template.details.label.length > max ? template.details.label.length : max;
			}, 0);

			templates.map((template) => {
				console.log(
					`        ${chalk.green(template.details.name.padEnd(maxLengthName + 2))} ${chalk.gray(template.details.label.padEnd(maxLengthLabel + 2))}`
				);
			});

			const locations = await getLocationsFile(context.project.path);
			if (locations) {
				console.log(`    ${chalk.white(`Badge Locations`)}`);
				process.stdout.write(`        ${chalk.green(`locations    ${chalk.gray(LOCATIONS_FILE.padEnd(maxLengthName + 2))}`)}  `);
			}
		}
	}

	if (!location || location == 'remote') {
		if (!location) {
			console.log();
		}
		const list = async (secretKey, siteId = '', name = '') => {
			if (!secretKey) {
				console.log(chalk.red('Unable to list remote badge template due to missing secretKey'));
				console.log(chalk.grey(`\n\tsnapfu secrets add\n`));
				return;
			}
			const remoteTemplates = await new ConfigApi(secretKey, options).getBadgeTemplates({ siteId });
			await wait(500);
			const remoteLocations = await new ConfigApi(secretKey, options).getBadgeLocations({ siteId });

			console.log(`${chalk.whiteBright(`Active Remote Templates (SMC) - ${name} ${chalk.cyan(`(${siteId})`)}`)}`);

			if (!remoteTemplates || !remoteTemplates.badgeTemplates || !remoteTemplates.badgeTemplates.length) {
				console.log(chalk.italic('    no templates found...'));
			} else {
				console.log(`    ${chalk.white(`Badge Templates`)}`);

				const maxLengthTag = remoteTemplates.badgeTemplates.reduce((max, template) => {
					return template.tag.length > max ? template.tag.length : max;
				}, 0);
				const maxLengthName = remoteTemplates.badgeTemplates.reduce((max, template) => {
					return template.name.length > max ? template.name.length : max;
				}, 0);

				remoteTemplates.badgeTemplates.map((template) => {
					process.stdout.write(`        ${chalk.green(template.tag.padEnd(maxLengthTag + 2))}`);
					process.stdout.write(`${chalk.gray(template.name.padEnd(maxLengthName + 2))}`);
					process.stdout.write(
						`Created: ${new Date(template.createdDate).toLocaleDateString()} ${new Date(template.createdDate).toLocaleTimeString('en-US')}   Updated: ${new Date(template.updatedDate).toLocaleDateString()} ${new Date(template.updatedDate).toLocaleTimeString('en-US')}\n`
					);
				});
				if (remoteLocations.locations) {
					console.log(`    ${chalk.white(`Badge Locations`)}`);
					process.stdout.write(
						`        ${chalk.green(`locations    ${chalk.gray(`${remoteLocations.global == 1 ? 'global' : LOCATIONS_FILE}`.padEnd(maxLengthName + 2))}`)}  `
					);
					process.stdout.write(
						`Created: ${new Date(remoteLocations.createdDate).toLocaleDateString()} ${new Date(remoteLocations.createdDate).toLocaleTimeString('en-US')}   Updated: ${new Date(remoteLocations.updatedDate).toLocaleDateString()} ${new Date(remoteLocations.updatedDate).toLocaleTimeString('en-US')}\n`
					);
				}
			}
		};

		try {
			if (options.multipleSites.length) {
				for (let i = 0; i < options.multipleSites.length; i++) {
					const { secretKey, siteId, name } = options.multipleSites[i];
					await list(secretKey, siteId, name);
					await wait(500);
					if (i < options.multipleSites.length - 1) console.log();
				}
			} else {
				const { secretKey } = options.options;
				await list(secretKey, options.context.integration.siteId, options.context.repository.name);
				await wait(500);
			}
		} catch (err) {
			console.log(chalk.red(err));
		}
	}
}

export async function removeBadgeTemplate(options) {
	const { context } = options;
	const { integration, repository } = context;
	const [command, templateName] = options.args;

	if (!integration || !context.project || !context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		return;
	}

	if (!templateName) {
		console.log(chalk.red(`Template name is required.`));
		return;
	}

	const payload = { name: templateName };

	const remove = async (secretKey, siteId) => {
		try {
			// using fancy terminal output replacement
			process.stdout.write(`${chalk.green(`        ${templateName}`)} - `);

			if (!secretKey) {
				console.log(chalk.red('Unable to archive remote badge template due to missing secretKey'));
				console.log(chalk.grey(`\n\tsnapfu secrets add\n`));
				return;
			}
			const { message } = await new ConfigApi(secretKey, options).archiveBadgeTemplate({ payload, siteId });
			if (message === 'success') {
				console.log(chalk.gray.italic('archived in remote'));
			} else {
				console.log(chalk.red.italic(message));
			}
		} catch (err) {
			process.stdout.write(chalk.red.italic('- archived failed'));
			console.log('        ', chalk.red(err));
		}
	};

	if (options.multipleSites.length) {
		for (let i = 0; i < options.multipleSites.length; i++) {
			const { secretKey, siteId, name } = options.multipleSites[i];

			console.log(`${chalk.white.bold(`${name} ${chalk.cyan(`(${siteId})`)}`)}`);
			await remove(secretKey, siteId);
			await wait(500);
		}
	} else {
		const { secretKey } = options.options;
		console.log(`${chalk.white.bold(`${repository.name}`)}`);
		await remove(secretKey, options.context.integration.siteId);
		await wait(500);
	}
}

export function validateLocations(locations) {
	const invalidLocationsParam = [];
	const requiredLocationParams = ['type', ...ROOT_LOCATIONS];
	requiredLocationParams.forEach((requiredParam) => {
		if (!(requiredParam in locations.details)) {
			invalidLocationsParam.push(`locations paramater '${requiredParam}' is required`);
		}
	});

	ROOT_LOCATIONS.forEach((rootLocation) => {
		const location = locations.details[rootLocation];
		if (!Array.isArray(location) || !location.length) {
			invalidLocationsParam.push(`Error: locations paramater '${rootLocation}' must be an array with at least 1 location`);
		} else if (location.length > 10) {
			invalidLocationsParam.push(`Error: locations paramater '${rootLocation}' must not exceed 10 locations`);
		} else {
			location.map((entry, index) => {
				if (!('tag' in entry) || typeof entry.tag !== 'string' || !entry.tag) {
					invalidLocationsParam.push(`Error: locations paramater '${rootLocation}[${index}]' must have a 'tag' property`);
				}
				if (!entry.tag.match(/^[a-zA-Z0-9_-]*$/)) {
					invalidLocationsParam.push(
						`Error: locations paramater '${rootLocation}[${index}]' tag must be an alphanumeric string (underscore and dashes also supported)`
					);
				}
				if (!('name' in entry) || typeof entry.name !== 'string' || !entry.name) {
					invalidLocationsParam.push(`Error: locations paramater '${rootLocation}[${index}]' must have a 'name' property`);
				}
			});
		}
	});

	const allLocations = ROOT_LOCATIONS.reduce((acc, location) => {
		return [...acc, ...(locations.details[location] || [])];
	}, []);

	const locationTags = allLocations.map((location) => location.tag);
	const duplicateLocationTags = locationTags.filter((location, index) => locationTags.indexOf(location) !== index);
	if (duplicateLocationTags.length) {
		invalidLocationsParam.push(`Error: locations paramater has duplicate location tags: ${duplicateLocationTags.join(', ')}`);
	}

	const locationNames = allLocations.map((location) => location.name);
	const duplicateLocationNames = locationNames.filter((location, index) => locationNames.indexOf(location) !== index);
	if (duplicateLocationNames.length) {
		invalidLocationsParam.push(`Error: locations paramater has duplicate location names: ${duplicateLocationNames.join(', ')}`);
	}

	if (invalidLocationsParam.length) {
		console.log(chalk.gray(locations.path));
		console.log(chalk.red(`Error: at ${LOCATIONS_FILE} file with the following issues:`));
		invalidLocationsParam.forEach((param) => {
			console.log('\t - ' + chalk.cyanBright(`${param}`));
		});
		exit(1);
	}
	return true;
}

export function validateTemplate(template, locations) {
	const requiredParams = ['type', 'name', 'label', 'component', 'locations'];
	let invalidParam = [];
	requiredParams.forEach((requiredParam) => {
		if (!(requiredParam in template.details)) {
			invalidParam.push(`template paramater '${requiredParam}' is required`);
		}
	});
	if (invalidParam.length) {
		// log missing template parameters first
		console.log(chalk.gray(template.path));
		console.log(chalk.red(`Error: at Template ${template.details?.name ? `'${template.details?.name}' ` : ''}has the following issues:`));
		invalidParam.forEach((param) => {
			console.log('\t - ' + chalk.cyanBright(`${param}`));
		});
		exit(1);
	}

	Object.keys(template.details).forEach((detail) => {
		// validate each parameter
		switch (detail) {
			case 'type':
				// handled by getTemplates - would not reach here.
				// case statement still required to be here for default statement handling unknown parameters
				break;
			case 'name':
				if (typeof template.details[detail] !== 'string' || !template.details[detail].match(/^[a-zA-Z0-9_-]*$/) || !template.details[detail]) {
					invalidParam.push(`template paramater '${detail}' must be an alphanumeric string (underscore and dashes also supported)`);
				}
				break;
			case 'label':
			case 'description':
			case 'component':
				if (typeof template.details[detail] !== 'string') {
					invalidParam.push(`template paramater '${detail}' must be a string`);
				}
				break;
			case 'locations':
				if (!Array.isArray(template.details[detail])) {
					invalidParam.push(`template paramater '${detail}' must be an array`);
				} else {
					if (template.details[detail].length == 0) {
						invalidParam.push(`template paramater '${detail}' must have at least 1 location`);
					}
					if (template.details[detail].length > 20) {
						invalidParam.push(`template paramater '${detail}' must not exceed 20 locations`);
					}
					if (locations) {
						let remoteLocations;
						try {
							remoteLocations = JSON.parse(locations);
						} catch (e) {
							invalidParam.push(`Error: Failed to parse JSON from remote locations`);
							break;
						}

						template.details[detail].map((location, index) => {
							if (typeof location !== 'string') {
								invalidParam.push(`template paramater '${detail}' must be an array of strings. Index ${index} is not a string`);
							} else if (location.includes('/')) {
								const locationParts = location.split('/');
								const [section, name] = locationParts;
								if (locationParts.length > 2) {
									invalidParam.push(`template paramater '${detail}' at index ${index} must not contain more than one '/'`);
								}
								if (location.endsWith('/')) {
									invalidParam.push(`template paramater '${detail}' at index ${index} must not end with '/'`);
								}
								if (location.startsWith('/')) {
									invalidParam.push(`template paramater '${detail}' at index ${index} must not start with '/'`);
								}
								if (!section || !ROOT_LOCATIONS.includes(section)) {
									invalidParam.push(
										`template paramater '${detail}' at index ${index} must start with ${ROOT_LOCATIONS.map((loc) => `'${loc}/'`).join(', ')}`
									);
								}
								if (!name) {
									invalidParam.push(`template paramater '${detail}' at index ${index} must have a name after '/'`);
								}
								const match = remoteLocations[section].find((locationEntry) => locationEntry.tag === name);
								if (!match) {
									invalidParam.push(`template paramater '${detail}' at index ${index} does not match any '${section}' location`);
								}
							} else if (!ROOT_LOCATIONS.includes(location)) {
								invalidParam.push(
									`template paramater '${detail}' at index ${index} must be ${ROOT_LOCATIONS.map((loc) => `'${loc}', '${loc}/[name]'`).join(', ')}`
								);
							}
						});
					} else {
						invalidParam.push(`Error: Failed to retrieve remote locations. Feature is likely not enabled.`);
					}
				}
				break;
			case 'value':
				if (
					typeof template.details[detail] !== 'object' ||
					!('enabled' in template.details[detail]) ||
					typeof template.details[detail]['enabled'] !== 'boolean'
				) {
					invalidParam.push(`template paramater '${detail}' must be an object with boolean property 'enabled'`);
				}
				if (template.details[detail]['validations'] && typeof template.details[detail]['validations'] !== 'object') {
					invalidParam.push(`template paramater '${detail}.validations' must be an object with properties min, max, regex and regexExplain`);
				}
				if (template.details[detail]['validations']) {
					if (
						'min' in template.details[detail]['validations'] &&
						(typeof template.details[detail]['validations']['min'] !== 'number' || template.details[detail]['validations']['min'] < 0)
					) {
						invalidParam.push(`template paramater '${detail}.validations.min' must not be a number below 0`);
					}
					if (
						'max' in template.details[detail]['validations'] &&
						(typeof template.details[detail]['validations']['max'] !== 'number' || template.details[detail]['validations']['max'] < 0)
					) {
						invalidParam.push(`template paramater '${detail}.validations.max' must not be a number below 0`);
					}
					if (
						'min' in template.details[detail]['validations'] &&
						'max' in template.details[detail]['validations'] &&
						template.details[detail]['validations']['min'] > template.details[detail]['validations']['max']
					) {
						invalidParam.push(`template paramater '${detail}.validations.min' must be a number lower than '${detail}.validations.max'`);
					}
					if (
						'regex' in template.details[detail]['validations'] &&
						(typeof template.details[detail]['validations']['regex'] !== 'string' || !template.details[detail]['validations']['regex'])
					) {
						invalidParam.push(`template paramater '${detail}.validations.regex' must be a string`);
					}
					if ('regex' in template.details[detail]['validations'] && !('regexExplain' in template.details[detail]['validations'])) {
						invalidParam.push(`template paramater '${detail}.validations' When using regex, please also provide regexExplain`);
					}
					if (
						'regexExplain' in template.details[detail]['validations'] &&
						(typeof template.details[detail]['validations']['regexExplain'] !== 'string' || !template.details[detail]['validations']['regexExplain'])
					) {
						invalidParam.push(`template paramater '${detail}.validations.regexExplain' must be a string`);
					}
				}
				break;
			case 'parameters':
				if (!Array.isArray(template.details[detail])) {
					invalidParam.push(`template paramater '${detail}' must be an array`);
				} else {
					const uniqueNames = [];
					const uniqueLabels = [];

					template.details[detail].map((parameter, i) => {
						uniqueNames.push(parameter['name']);
						uniqueLabels.push(parameter['label']);
						Object.keys(parameter).forEach((key) => {
							if (!['name', 'type', 'label', 'description', 'defaultValue', 'validations', 'options'].includes(key)) {
								invalidParam.push(`template paramater '${detail}[${i}].${key}' is not a valid parameter`);
							}
							if (['name', 'type', 'label', 'description', 'defaultValue'].includes(key) && (typeof parameter[key] !== 'string' || !parameter[key])) {
								invalidParam.push(`template paramater '${detail}[${i}].${key}' must be a string with a value`);
							}
							const allowedTypes = ['array', 'string', 'color', 'url', 'integer', 'decimal', 'boolean', 'checkbox', 'toggle'];
							if (key === 'type') {
								if (!allowedTypes.includes(parameter[key])) {
									invalidParam.push(`template paramater '${detail}[${i}].${key}' must be one of allowed types: ${allowedTypes.join(', ')}`);
								}
								const { options, defaultValue, validations } = template.details[detail][i];
								const { min, max, regex, regexExplain } = validations || {};
								switch (parameter[key]) {
									case 'array':
										if (!options || !Array.isArray(options) || options.length === 0) {
											invalidParam.push(
												`template paramater '${detail}[${i}].options' must be an array with at least 1 option when type: 'array' is used`
											);
										}
										if (defaultValue && !options?.includes(defaultValue)) {
											invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be one of the options in 'options' array`);
										}
										if (validations) {
											invalidParam.push(`template paramater '${detail}[${i}].validations' should not be used with type: 'array'`);
										}
										break;
									case 'string':
									case 'url':
										if (validations) {
											if (min && typeof min !== 'number') {
												invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be a number`);
											}
											if (max && typeof max !== 'number') {
												invalidParam.push(`template paramater '${detail}[${i}].validations.max' must be a number`);
											}
											if (min && max && min > max) {
												invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be a number lower than 'validations.max'`);
											}
											if (regex && typeof regex !== 'string') {
												invalidParam.push(`template paramater '${detail}[${i}].validations.regex' must be a string`);
											}
											if (regex && !regexExplain) {
												invalidParam.push(`template paramater '${detail}[${i}].validations' When using regex, please also provide regexExplain`);
											}
											if (regexExplain && typeof regexExplain !== 'string') {
												invalidParam.push(`template paramater '${detail}[${i}].validations.regexExplain' must be a string`);
											}
											if (defaultValue && regex && !new RegExp(regex).test(defaultValue)) {
												invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must match the regex pattern in 'validations.regex'`);
											}
											if (defaultValue && min && defaultValue.length < min && min > 0) {
												invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be at least ${min} characters long`);
											}
											if (defaultValue && max && defaultValue.length > max && max > 0) {
												invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must not exceed ${max} characters long`);
											}
										}
										break;
									case 'color':
										if (validations) {
											invalidParam.push(`template paramater '${detail}[${i}].validations' should not be used with type: 'color'`);
										}
										const rgbaMatch = /^rgba\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1}(\.\d{1,2})?)\)$/;
										if (defaultValue && !new RegExp(rgbaMatch).test(defaultValue)) {
											invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be a valid rgba color`);
										}
										break;
									case 'integer':
										if (min && min % 1 !== 0) {
											invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be an integer`);
										}
										if (max && max % 1 !== 0) {
											invalidParam.push(`template paramater '${detail}[${i}].validations.max' must be an integer`);
										}
									// no break intentional
									case 'decimal':
										if (validations) {
											if (regex || regexExplain) {
												invalidParam.push(
													`template paramater '${detail}[${i}].validations.regex' or '${detail}[${i}].validations.regexExplain' should not be used with type: 'integer' or 'decimal'`
												);
											}
											if (min && typeof min !== 'number') {
												invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be a number`);
											}
											if (max && typeof max !== 'number') {
												invalidParam.push(`template paramater '${detail}[${i}].validations.max' must be a number`);
											}
											if (min && max && min > max) {
												invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be a number lower than 'validations.max'`);
											}
											if (defaultValue && (typeof defaultValue !== 'string' || isNaN(Number(defaultValue)))) {
												invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be a string containing a number`);
											}
											if (defaultValue && min && Number(defaultValue) < min) {
												invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be at least ${min} (validations.min)`);
											}
											if (defaultValue && max && Number(defaultValue) > max) {
												invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must not exceed ${max} (validations.max)`);
											}
										}
										break;
									case 'boolean':
									case 'checkbox':
									case 'toggle':
										if (validations) {
											invalidParam.push(
												`template paramater '${detail}[${i}].validations' should not be used with type: 'boolean', 'checkbox', 'toggle'`
											);
										}
										if (defaultValue && typeof defaultValue !== 'string' && !['true', '1', 'false', '0'].includes(defaultValue)) {
											invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be a string containing 'true', '1', 'false', '0'`);
										}
										break;
									default:
										invalidParam.push(
											`template paramater '${detail}[${i}].type' value of ${parameter[key]} is not a valid type. Must be one of ${allowedTypes.join(', ')}`
										);
										break;
								}
							}

							if (key === 'validations') {
								if (typeof parameter[key] !== 'object') {
									invalidParam.push(`template paramater '${detail}[${i}].${key}' must be an object`);
								}
								if ('min' in parameter[key] && (typeof parameter[key]['min'] !== 'number' || parameter[key]['min'] < 0)) {
									invalidParam.push(`template paramater '${detail}[${i}].${key}.min' must not be a number below 0`);
								}
								if ('max' in parameter[key] && (typeof parameter[key]['max'] !== 'number' || parameter[key]['max'] < 0)) {
									invalidParam.push(`template paramater '${detail}[${i}].${key}.max' must not be a number below 0`);
								}
								if ('min' in parameter[key] && 'max' in parameter[key] && parameter[key]['min'] > parameter[key]['max']) {
									invalidParam.push(`template paramater '${detail}[${i}].${key}.min' must be a number lower than '${detail}[${i}].${key}.max'`);
								}
								if ('regex' in parameter[key] && (typeof parameter[key]['regex'] !== 'string' || !parameter[key]['regex'])) {
									invalidParam.push(`template paramater '${detail}[${i}].${key}.regex' must be a string`);
								}
								if ('regex' in parameter[key] && !('regexExplain' in parameter[key])) {
									invalidParam.push(`template paramater '${detail}[${i}].${key}' When using regex, please also provide regexExplain`);
								}
								if ('regexExplain' in parameter[key] && (typeof parameter[key]['regexExplain'] !== 'string' || !parameter[key]['regexExplain'])) {
									invalidParam.push(`template paramater '${detail}[${i}].${key}.regexExplain' must be a string`);
								}
							}
						});
					});

					const duplicateParameterNames = uniqueNames.filter((location, index) => uniqueNames.indexOf(location) !== index);
					if (duplicateParameterNames.length) {
						invalidParam.push(
							`template paramater '${detail}' contains duplicate parameter names: ${duplicateParameterNames.map((name) => `'${name}'`).join(', ')}`
						);
					}

					const duplicateParameterLabels = uniqueLabels.filter((location, index) => uniqueLabels.indexOf(location) !== index);
					if (duplicateParameterLabels.length) {
						invalidParam.push(
							`template paramater '${detail}' contains duplicate parameter labels: ${duplicateParameterLabels.map((label) => `'${label}'`).join(', ')}`
						);
					}
				}
				break;
			default:
				invalidParam.push(`unknown template parameter '${detail}' should be removed`);
				break;
		}
	});
	if (invalidParam.length) {
		console.log(chalk.gray(template.path));
		console.log(chalk.red(`Error: at Template ${template.details?.name ? `'${template.details?.name}' ` : ''}has the following issues:`));
		invalidParam.forEach((param) => {
			console.log('\t - ' + chalk.cyanBright(`${param}`));
		});
		exit(1);
	}
	return true;
}

export async function syncBadgeTemplate(options) {
	const { context } = options;
	const { integration, repository } = context;
	const [_, templateName] = options.args;
	const { secretKey } = options.options;

	if (!integration || !context.project || !context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		return;
	}

	const locations = await getLocationsFile(context.project.path);
	if (locations) {
		validateLocations(locations);
	}

	const templates = await getTemplates(context.project.path);
	const syncTemplates = templateName ? templates.filter((template) => template.details.name == templateName) : templates;

	if (!syncTemplates.length && templateName != LOCATIONS_FILE) {
		console.log(chalk.grey(`No templates found.\n`));
		return;
	}

	const sync = async (template, secretKey, siteId) => {
		if (!secretKey) {
			console.log(chalk.red('Unable to sync remote badge template due to missing secretKey'));
			console.log(chalk.grey(`\n\tsnapfu secrets add\n`));
			return;
		}
		// validate template against remote locations (locations get validated and synced first)
		const { locations } = await new ConfigApi(secretKey, options).getBadgeLocations({ siteId });
		validateTemplate(template, locations);

		const payload = buildBadgeTemplatePayload(template.details);
		await wait(500);
		const remoteTemplates = await new ConfigApi(secretKey, options).getBadgeTemplates({ siteId });
		const remoteTemplate = remoteTemplates.badgeTemplates?.find((remoteTemplate) => remoteTemplate.tag == template.details.name);
		try {
			if (!remoteTemplate) {
				throw new Error('Remote template not found, syncing new template');
			}
			// prevent sync if template matches remote template
			const { name, properties, description, snapComponent, labelConfig, locations } = remoteTemplate;
			let parsedLocations, parsedLabelConfig, parsedProperties;
			try {
				parsedLocations = JSON.parse(locations);
				parsedLabelConfig = JSON.parse(labelConfig);
				parsedProperties = JSON.parse(properties);
			} catch (e) {
				console.log(chalk.red(`Error: Failed parse JSON from remote template ${remoteTemplate.tag}`));
				console.log(e);
				exit(1);
			}

			if (payload.label !== name) throw new Error('Template names differ');
			if (payload.description !== description) throw new Error('Template desicriptions differ');
			if (payload.component !== snapComponent) throw new Error('Template components differ');

			deepStrictEqual(parsedLabelConfig, payload.value);
			deepStrictEqual(parsedLocations, payload.locations);
			deepStrictEqual(parsedProperties, payload.parameters);

			console.log(chalk.green(`        ${template.details.name} - ${chalk.yellow(`no changes to sync`)}`));
		} catch (err) {
			try {
				await wait(500);
				const { message } = await new ConfigApi(secretKey, options).putBadgeTemplate({ payload, siteId });
				if (message === 'success') {
					console.log(chalk.green(`        ${template.details.name} - ${chalk.gray.italic('synced to remote')}`));
				} else {
					console.log(chalk.green(`        ${template.details.name} - ${chalk.red.italic(message)}`));
					exit(1);
				}
			} catch (err) {
				console.log(chalk.red(`        ${template.details.name}`));
				console.log('        ', chalk.red(err));
				exit(1);
			}
		}
	};

	const syncLocations = async (secretKey, siteId) => {
		if (!secretKey) {
			console.log(chalk.red('Unable to sync remote badge locations due to missing secretKey'));
			console.log(chalk.grey(`\n\tsnapfu secrets add\n`));
			return;
		}
		console.log(`    synchronizing locations`);
		const locationsPayload = buildBadgeLocationsPayload(locations.details);
		const remoteBadgeLocations = await new ConfigApi(secretKey, options).getBadgeLocations({ siteId });

		// sync custom locations if locations.json file exists
		if (remoteBadgeLocations.locations) {
			try {
				const remoteLocations = JSON.parse(remoteBadgeLocations.locations);

				try {
					deepStrictEqual(locationsPayload, remoteLocations);
					console.log(chalk.green(`        ${LOCATIONS_FILE} - ${chalk.yellow(`no changes to sync`)}`));
				} catch (err) {
					try {
						await wait(500);
						const { message } = await new ConfigApi(secretKey, options).putBadgeLocations({ payload: locationsPayload, siteId });
						if (message === 'success') {
							console.log(chalk.green(`        ${LOCATIONS_FILE} - ${chalk.gray.italic('synced to remote')}`));
						} else {
							console.log(chalk.green(`        ${LOCATIONS_FILE} - ${chalk.red.italic(message)}`));
							exit(1);
						}
					} catch (err) {
						console.log(chalk.red(`        ${LOCATIONS_FILE}`));
						console.log('        ', chalk.red(err));
						exit(1);
					}
				}
			} catch (e) {
				console.log(chalk.red(`Error: Failed parse JSON from remote locations`));
				console.log(e);
				exit(1);
			}
		} else {
			console.log(chalk.red(`Error: Failed to retrieve remote badge locations. The feature is likely not enabled.`));
			exit(1);
		}
	};

	if (options.multipleSites.length) {
		for (let x = 0; x < options.multipleSites.length; x++) {
			const { secretKey, siteId, name } = options.multipleSites[x];

			console.log(`${chalk.white.bold(`${name} ${chalk.cyan(`(${siteId})`)}`)}`);

			if ((locations && syncTemplates.length && !templateName) || templateName == LOCATIONS_FILE) {
				await syncLocations(secretKey, siteId);
				await wait(1000);
			}
			for (let i = 0; i < syncTemplates.length; i++) {
				const template = syncTemplates[i];
				console.log(`    synchronizing template ${i + 1} of ${syncTemplates.length}`);

				await sync(template, secretKey, siteId);
				await wait(500);
			}

			if (x < options.multipleSites.length - 1) console.log();
		}
	} else {
		console.log(`${chalk.white.bold(`${repository.name}`)}`);
		if ((locations && !templateName) || templateName == LOCATIONS_FILE) {
			await syncLocations(secretKey, options.context.integration.siteId);
			await wait(1000);
		}
		for (let i = 0; i < syncTemplates.length; i++) {
			const template = syncTemplates[i];
			console.log(`    synchronizing template ${i + 1} of ${syncTemplates.length}`);
			await sync(template, secretKey, options.context.integration.siteId);
			await wait(500);
		}
	}
}

export function generateTemplateSettings({ name, description, type }) {
	let settings = {
		type,
		name: handleize(name),
		label: `${pascalCase(name)} Badge`,
		description: description || `${name} custom template`,
		component: `${pascalCase(name)}`,
		locations: ROOT_LOCATIONS,
		value: {
			enabled: true,
		},
		parameters: [],
	};

	return JSON.stringify(settings, null, '\t');
}

export async function getTemplates(dir) {
	try {
		const files = await findJsonFiles(dir);
		const fileReads = files.map((filePath) => readTemplateSettings(filePath));
		const fileContents = await Promise.all(fileReads);

		return fileContents
			.map((template, index) => {
				return {
					path: files[index],
					details: template,
				};
			})
			.filter((template) => {
				if (
					typeof template.details == 'object' &&
					template.details.type &&
					template.details.type == `${TEMPLATE_TYPE_BADGES}/default` &&
					template.details.type !== `${TEMPLATE_TYPE_BADGES}/locations`
				) {
					return template;
				}
			});
	} catch (err) {
		console.log(err);
		return [];
	}
}

export async function getLocationsFile(dir) {
	try {
		const files = await findJsonFiles(dir);
		const fileReads = files.map((filePath) => readTemplateSettings(filePath));
		const fileContents = await Promise.all(fileReads);

		const locations = fileContents
			.map((template, index) => {
				return {
					path: files[index],
					details: template,
				};
			})
			.filter((template) => {
				if (typeof template.details == 'object' && template.details.type === `${TEMPLATE_TYPE_BADGES}/locations`) {
					return template;
				}
			});
		if (locations.length > 1) {
			console.log(chalk.red(`Error: Multiple locations files found in ${dir}`));
			exit(1);
		}
		return locations[0];
	} catch (err) {
		console.log(err);
		return;
	}
}

export async function writeTemplateFile(filePath, contents) {
	const baseDir = path.dirname(filePath);

	await fsp.mkdir(baseDir, { recursive: true });

	try {
		const exists = await fsp.stat(filePath);
		console.log(chalk.yellow(`File already exists: ${filePath}`));
	} catch (err) {
		console.log(chalk.green(`Creating file: ${filePath}`));
		await fsp.writeFile(filePath, contents, 'utf8');
	}
}

export async function readTemplateSettings(filePath) {
	let fileContents;

	try {
		fileContents = await fsp.readFile(filePath, 'utf8');
	} catch (err) {
		console.log(chalk.red(`Error: Failed to read file: ${filePath}`));
		fileContents = '';
	}

	try {
		const fileParsed = JSON.parse(fileContents);
		return fileParsed;
	} catch (err) {
		console.log(chalk.red(`Error: invalid JSON in file: ${filePath}`));
		return {};
	}
}

export async function findJsonFiles(dir) {
	// get all JSON files (exclude looking in excluded directories)
	try {
		const details = await fsp.stat(dir);
		if (!details || !details.isDirectory) {
			throw 'Directory not provided.';
		}

		let templateFiles = [];

		const contents = await fsp.readdir(dir);
		const readPromises = contents
			.filter((file) => {
				const filePath = path.resolve(dir, file);
				try {
					const fileStats = fs.statSync(filePath);

					if (!fileStats.isSymbolicLink() && fileStats.isDirectory() && !DIR_EXCLUDE_LIST.includes(file)) {
						return file;
					} else if (file.match(/\.json$/)) {
						templateFiles.push(filePath);
					}
				} catch (err) {
					// not doing anything currently...
				}
			})
			.map((file) => {
				return findJsonFiles(path.resolve(dir, file));
			});

		const dirContents = await Promise.all(readPromises);

		return [...templateFiles, ...dirContents.flat(1)];
	} catch (err) {
		console.log(chalk.red(`Error: cannot find templates in: ${dir}`));
		throw err;
	}
}

export function buildBadgeLocationsPayload(template) {
	return ROOT_LOCATIONS.reduce((acc, location) => {
		acc[location] = template[location];
		return acc;
	}, {});
}
export function buildBadgeTemplatePayload(template) {
	const payload = {
		type: template.type,
		name: template.name,
		label: template.label || `${pascalCase(template.name)} Badge`,
		description: template.description || `${template.name} custom template`,
		component: template.component,
		locations: template.locations,
		value: {
			enabled: typeof template.value?.enabled === 'boolean' ? template.value.enabled : true,
		},
		parameters:
			template.parameters?.map((parameter) => {
				// mapping to only include the necessary fields
				const data = {
					name: parameter.name,
					type: parameter.type,
					label: parameter.label,
					description: parameter.description,
				};
				if (parameter.defaultValue) {
					data.defaultValue = parameter.defaultValue;
				}
				if (parameter.options) {
					data.options = parameter.options;
				}
				if (parameter.validations) {
					data.validations = parameter.validations;
				}
				return data;
			}) || [],
	};
	if (template.value?.validations) {
		payload.value.validations = template.value.validations;
	}
	return payload;
}

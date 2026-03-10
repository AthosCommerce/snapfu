import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs, { promises as fsp } from 'fs';
import { exit } from 'process';
import { help } from './help.js';
import { wait, copy, copyTransform, pascalCase, handleize } from './utils/index.js';
import { DEFAULT_BRANCH } from './init.js';
import { ConfigApi } from './services/ConfigApi.js';
import { buildLibrary } from './library.js';

const TEMPLATE_TYPE_RECS = 'snap/recommendation';
const TEMPLATE_TYPES = ['default', 'email', 'bundle'];
const DIR_EXCLUDE_LIST = ['node_modules', '.git'];

function showTemplateHelp() {
	help({ command: 'help', args: ['template'] });
}

export async function initTemplate(options) {
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

	if (!framework?.components?.recommendation) {
		console.log(chalk.red(`Error: Library does not contain recommendation components.`));
		return;
	}

	const templateDefaultDir = path.resolve(context.project.path, options.config.directories.components.recommendation);
	const answers1 = await inquirer.prompt([
		{
			type: 'list',
			name: 'type',
			message: 'Please select the type of recommendations:',
			choices: Object.keys(framework.components.recommendation),
			default: 'default',
		},
	]);

	const type = answers1.type;
	const componentOptions = library[integration.framework].components.recommendation[type];
	let answers2;
	const keys = Object.keys(componentOptions);
	if (keys.length > 1) {
		answers2 = await inquirer.prompt([
			{
				type: 'list',
				name: 'componentType',
				message: `Please select the type of ${type} recommendation component to use:`,
				choices: Object.keys(componentOptions),
				default: 'default',
			},
		]);
	} else {
		answers2 = { componentType: keys[0] };
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
			default: path.join(options.config.directories.components.recommendation, componentName),
		},
	]);

	const answers = { ...answers1, ...answers2, ...answers3, ...answers4 };

	const description = answers && answers.description;
	const templateDir = (answers && answers.directory) || templateDefaultDir;
	const component = framework.components.recommendation[answers.type][answers.componentType];

	if (component?.variables) {
		answers.custom = {};

		for (let i = 0; i < component.variables.length; i++) {
			const v = component.variables[i];
			let answr = await inquirer.prompt([
				{
					name: v.name,
					type: v.type,
					message: v.message,
					choices: v.choices || undefined,
					default: v.default || undefined,
					validate: v.validate
						? (input) => {
								try {
									const fn = new Function(`
								var validation = ${v.validate}
								return validation('${input}');
							`);

									const validationReturn = fn();

									//native inquirer error msg
									if (typeof validationReturn === 'string') {
										return validationReturn;
									}

									return validationReturn;
								} catch (e) {
									console.log('\nInvalid validation function provided. This function may have a syntax error: \n', v.validate, '\n', e);
									exit(1);
								}
							}
						: undefined,
				},
			]);
			answers.custom[v.name] = answr[v.name];
		}
	}

	try {
		// copy over files for new component
		if (component || !component.path || !component.files?.length) {
			console.log(`\nInitializing template...`);

			// create component template JSON descriptor file
			await writeTemplateFile(
				path.resolve(context.project.path, templateDir, `${componentName}.json`),
				generateTemplateSettings({ name, description, type: `${TEMPLATE_TYPE_RECS}/${answers.type}` })
			);

			let options = { clobber: false };
			const variables = {
				'snapfu.variables.name': name,
				'snapfu.variables.component': componentName,
				'snapfu.variables.class': handleize(name),
			};

			if (answers.custom) {
				Object.keys(answers.custom).forEach((key) => {
					variables[`snapfu.variables.${key}`] = answers.custom[key];
				});
			}

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

				if (fileDetails.ext && fileDetails.name.toLowerCase() == answers.componentType.toLowerCase()) {
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

export async function listTemplates(options) {
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
			// reduce type to cooresponding TEMPLATE_TYPES
			templates.map((template, index) => {
				template.recommendationType = template.details?.type?.replace('snap/recommendation/', '') || 'default';
			});

			TEMPLATE_TYPES.forEach((type) => {
				const typeTemplates = templates.filter((template) => template.recommendationType == type);
				if (typeTemplates.length) {
					console.log(`    ${chalk.white(`${type.charAt(0).toUpperCase() + type.slice(1)} Templates`)}`);
					// loop through each template and log details
					typeTemplates.map((template) => {
						console.log(`        ${chalk.green(template.details.name)} ${repository.branch ? chalk.blue(`[${repository.branch}]`) : ''}`);
					});
				}
			});
		}
	}

	if (!location || location == 'remote') {
		if (!location) {
			console.log();
		}

		let smcManaged;

		const list = async (secretKey, siteId = '', name = '') => {
			if (!secretKey) {
				console.log(chalk.red('Unable to list remote template due to missing secretKey'));
				console.log(chalk.grey(`\n\tsnapfu secrets add\n`));
				return;
			}
			const remoteTemplates = await new ConfigApi(secretKey, options).getTemplates({ siteId });

			console.log(`${chalk.whiteBright(`Active Remote Templates (SMC) - ${name} ${chalk.cyan(`(${siteId})`)}`)}`);

			if (!remoteTemplates || !remoteTemplates.recommendTemplates || !remoteTemplates.recommendTemplates.length) {
				console.log(chalk.italic('    no templates found...'));
			} else {
				remoteTemplates.recommendTemplates.forEach((template) => {
					if (!template.managed) {
						smcManaged = true;
					}
				});

				// loop through each type and log them
				TEMPLATE_TYPES.forEach((type) => {
					const typeTemplates = remoteTemplates.recommendTemplates.filter((template) => (template.type || 'default') == type);
					if (typeTemplates.length) {
						console.log(`    ${chalk.white(`${type.charAt(0).toUpperCase() + type.slice(1)} Templates`)}`);
						// loop through each template and log details
						typeTemplates.map((template) => {
							const [name, branch] = template.name.split('__');
							console.log(`        ${template.managed ? '' : `${chalk.yellow('*')} `} ${chalk.green(name)} ${chalk.blue(`[${branch}]`)}`);
						});
					}
				});
			}
			await wait(500);
		};

		try {
			if (options.multipleSites.length) {
				for (let i = 0; i < options.multipleSites.length; i++) {
					const { secretKey, siteId, name } = options.multipleSites[i];
					await list(secretKey, siteId, name);
					if (i < options.multipleSites.length - 1) console.log();
				}
			} else {
				const { secretKey } = options.options;
				await list(secretKey, options.context.integration.siteId, options.context.repository.name);
			}

			if (smcManaged) {
				console.log(`\n${chalk.yellow('* manually managed in the SMC')}`);
			}
		} catch (err) {
			console.log(chalk.red(err));
		}
	}
}

export async function removeTemplate(options) {
	const { context } = options;
	const { integration, repository } = context;
	const [command, templateName, branch] = options.args;

	if (!integration || !context.project || !context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		return;
	}

	if (!templateName) {
		console.log(chalk.red(`Template name is required.`));
		return;
	}

	const branchName = branch || repository.branch || DEFAULT_BRANCH;

	const payload = { name: templateName, branch: branchName };

	const remove = async (secretKey, siteId) => {
		try {
			// using fancy terminal output replacement
			process.stdout.write(`${chalk.green(`        ${templateName}`)} ${chalk.blue(`[${branchName}]`)}`);

			if (!secretKey) {
				console.log(chalk.red('Unable to archive remote template due to missing secretKey'));
				console.log(chalk.grey(`\n\tsnapfu secrets add\n`));
				return;
			}
			await new ConfigApi(secretKey, options).archiveTemplate({ payload, siteId });

			process.stdout.write(chalk.gray.italic(' - archived in remote ') + '\n');
		} catch (err) {
			process.stdout.write(chalk.red.italic(' - archived failed'));
			console.log('        ', chalk.red(err));
			exit(1);
		}

		await wait(500);
	};

	if (options.multipleSites.length) {
		for (let i = 0; i < options.multipleSites.length; i++) {
			const { secretKey, siteId, name } = options.multipleSites[i];

			console.log(`${chalk.white.bold(`${name} ${chalk.cyan(`(${siteId})`)}`)}`);
			await remove(secretKey, siteId);
		}
	} else {
		const { secretKey } = options.options;
		console.log(`${chalk.white.bold(`${repository.name}`)}`);
		await remove(secretKey, options.context.integration.siteId);
	}
}

export async function syncTemplate(options) {
	const { context } = options;
	const { integration, repository } = context;
	const [command, templateName, branch] = options.args;
	const { secretKey } = options.options;

	if (!integration || !context.project || !context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		return;
	}

	const templates = await getTemplates(context.project.path);
	const syncTemplates = templates.filter((template) => {
		//lets validate all the details are valid before we sync
		let invalidParam;
		Object.keys(template.details).forEach(function (detail) {
			if (typeof template.details[detail] !== 'string') {
				if (detail == 'parameters') {
					template.details[detail].map((index) => {
						Object.keys(index).forEach(function (parameters) {
							if (typeof index[parameters] !== 'string') {
								invalidParam = `${detail}: { ${parameters}: ${index[parameters]} }`;
							}
						});
					});
				} else {
					invalidParam = `${detail} ${template.details[detail]}`;
				}
			}
		});

		if (invalidParam) {
			console.log(
				chalk.red(`
Error: Invalid template configuration found on template ${chalk.white.underline(template.details.name)}!`)
			);
			console.log(
				chalk.cyanBright(`
			
${invalidParam}
			
			`)
			);
			console.log(
				chalk.whiteBright(`Please ensure all template config values are strings.
		
			`)
			);
			//Stop everything
			exit(1);
		} else {
			if (templateName) {
				if (template.details.name == templateName) return template;
			} else {
				return template;
			}
		}
	});

	if (!syncTemplates.length) {
		console.log(chalk.grey(`No templates found.\n`));
		return;
	}

	const branchName = branch || repository.branch || DEFAULT_BRANCH;
	if (repository && repository.branchList && !repository.branchList.includes(branchName)) {
		console.log(chalk.red(`Error: Branch not found. - ${branch}`));
		return;
	}

	const sync = async (template, secretKey, siteId) => {
		if (!secretKey) {
			console.log(chalk.red('Unable to sync remote template due to missing secretKey'));
			console.log(chalk.grey(`\n\tsnapfu secrets add\n`));
			return;
		}
		const payload = buildTemplatePayload(template.details, { branch: branchName, framework: integration.framework });

		if (payload.name && !payload.name.match(/^[a-zA-Z0-9_-]*$/)) {
			console.log(chalk.red(`Error: Template name must be an alphanumeric string (underscore and dashes also supported).`));
			return;
		}

		try {
			await new ConfigApi(secretKey, options).putTemplate({ payload, siteId });
			console.log(chalk.green(`        ${template.details.name}`), chalk.blue(`[${branchName}]`));
		} catch (err) {
			console.log(chalk.red(`        ${template.details.name}`), chalk.blue(`[${branchName}]`));
			console.log('        ', chalk.red(err));
			exit(1);
		}

		// prevent rate limiting
		await wait(500);
	};

	if (options.multipleSites.length) {
		for (let x = 0; x < options.multipleSites.length; x++) {
			const { secretKey, siteId, name } = options.multipleSites[x];

			console.log(`${chalk.white.bold(`${name} ${chalk.cyan(`(${siteId})`)}`)}`);
			for (let i = 0; i < syncTemplates.length; i++) {
				const template = syncTemplates[i];
				console.log(`    synchronizing template ${i + 1} of ${syncTemplates.length}`);

				await sync(template, secretKey, siteId);
			}

			if (x < options.multipleSites.length - 1) console.log();
		}
	} else {
		console.log(`${chalk.white.bold(`${repository.name}`)}`);
		for (let i = 0; i < syncTemplates.length; i++) {
			const template = syncTemplates[i];
			console.log(`    synchronizing template ${i + 1} of ${syncTemplates.length}`);
			await sync(template, secretKey, options.context.integration.siteId);
		}
	}
}

export function generateTemplateSettings({ name, description, type }) {
	let settings = {
		type,
		name: handleize(name),
		label: name,
		description: description || `${name} custom template`,
		component: `${pascalCase(name)}`,
	};
	if (type.indexOf('email') == -1) {
		settings = {
			...settings,
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
	}

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
					template.details.type.startsWith(TEMPLATE_TYPE_RECS) &&
					template.details.name &&
					template.details.label &&
					template.details.component
				) {
					return template;
				}
			});
	} catch (err) {
		console.log(err);
		return [];
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

export function buildTemplatePayload(template, vars) {
	return {
		name: template.name,
		type: template.type,
		component: template.component,
		meta: {
			searchspringTemplate: {
				type: 'snap',
				label: template.label,
				description: template.description,
			},
			searchspringTemplateSnap: {
				branch: vars.branch,
				group: template.name,
				framework: vars.framework || 'unknown',
				managed: 'true',
				type: template.type.replace(TEMPLATE_TYPE_RECS, '').replace('/', '') || 'default',
			},
			searchspringRecommendProfile: {
				label: template.label,
				description: template.description,
				orientation: template.orientation || 'horizontal',
			},
		},
		parameters: template.parameters,
	};
}

/*
	Current commands utilizing components:
	* recs init
	
	snapfu-library https://github.com/searchspring/snapfu-library
*/

import { existsSync, mkdirSync, promises as fsp, statSync } from 'fs';
import { exit } from 'process';
import path from 'path';
import chalk from 'chalk';
import YAML from 'yaml';
import { commandOutput } from './utils/index.js';

export const setupLibraryRepo = async (options) => {
	// clone or pull snapfu library repository
	try {
		if (!existsSync(options.config.snapfuDir)) {
			mkdirSync(options.config.snapfuDir);
		}
		if (existsSync(options.config.library.dir)) {
			const { stdout, stderr } = await commandOutput(`git pull`, options.config.library.dir);

			if (options.dev) {
				console.log(`Updating ${options.config.library.repoName}...`);
				console.log(stdout || stderr);
			}
		} else {
			const { stdout, stderr } = await commandOutput(
				`git clone ${options.config.library.repoUrl} ${options.config.library.repoName}`,
				options.config.snapfuDir
			);

			if (options.dev) {
				console.log(`Cloning ${options.config.library.repoName} into ${options.config.library.dir} ...`);
				console.log(stdout || stderr);
			}
		}
	} catch (e) {
		console.log(chalk.red(`Failed to update library files!`));

		if (options.dev) {
			console.log(chalk.red(e));
		}
		exit(1);
	}
};

export const buildLibrary = async (options) => {
	await setupLibraryRepo(options);

	// build library object from files in repo
	/*
		const library = {
			preact: {
				components: {
					...
				},
				patches: {
					... TODO Later
				}
			}
		}
	*/

	const { context } = options;
	const { integration } = context;

	if (!integration || !context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		return;
	}

	const { framework } = integration || {};

	// ~/.athoscommerce/snapfu-library/[athos | searchspring]/{framework}
	const frameworkPath = path.join(options.config.library.dir, options.context.project.org, framework);
	const frameworkDirExists = existsSync(frameworkPath);
	const library = {};

	if (frameworkDirExists) {
		const components = await buildLibraryComponents(path.join(frameworkPath, 'components'), options);

		library[framework] = {
			components,
		};
	}

	return library;
};

export const buildLibraryComponents = async (dir, options) => {
	// ~/.athoscommerce/snapfu-library/[athos | searchspring]/{framework}/{components}
	const componentsDirContents = await fsp.readdir(dir);

	const components = {};
	// component categories (recommendation/badge)
	for (const categoryFile of componentsDirContents) {
		const filePath = path.resolve(dir, categoryFile);
		const fileStats = await statSync(filePath);
		if (fileStats.isDirectory()) {
			const componentCategory = {};

			// parse contents of component category to get component details
			const componentCategoryContents = await fsp.readdir(filePath);

			for (const componentTypeFile of componentCategoryContents) {
				const componentTypeFilePath = path.resolve(filePath, componentTypeFile);
				const subDirStats = await statSync(componentTypeFilePath);

				if (subDirStats.isDirectory()) {
					const subDir = await fsp.readdir(componentTypeFilePath);

					for (const componentFile of subDir) {
						const componentFilePath = path.resolve(componentTypeFilePath, componentFile);
						const componentFileStats = await statSync(componentTypeFilePath);

						if (componentFileStats.isDirectory()) {
							// get contents and set files
							const componentContents = await fsp.readdir(componentFilePath);
							// ['Default.jsx', 'Default.tsx', 'Default.scss']
							// exclude files based on project type (javascript|typescript)
							const filteredComponentContents = componentContents.filter((fileName) => {
								//exclude variable files
								if (fileName.endsWith('.yaml')) {
									return false;
								}
								if (options.context.project.type === 'typescript') {
									return !(fileName.endsWith('.jsx') || fileName.endsWith('.js'));
								} else {
									return !(fileName.endsWith('.tsx') || fileName.endsWith('.ts'));
								}
							});

							let componentDescriptorYaml = componentContents.filter((fileName) => fileName.endsWith('.yaml'));
							let parsedComponentDescriptorYaml;
							if (componentDescriptorYaml.length) {
								try {
									parsedComponentDescriptorYaml = YAML.parse(await fsp.readFile(`${componentFilePath}/${componentDescriptorYaml}`, 'utf8'));
								} catch (err) {
									console.log(chalk.red(`Failed to parse ${componentDescriptorYaml} contents...\n`));
									console.log(err);
									exit(1);
								}
							}

							if (!componentCategory[componentTypeFile]) {
								//initialize
								componentCategory[componentTypeFile] = {};
							}

							componentCategory[componentTypeFile][componentFile] = {
								path: componentFilePath,
								label: componentFile,
								files: filteredComponentContents,
								variables: parsedComponentDescriptorYaml?.variables || undefined,
							};
						}
					}
				}
			}

			// add component entries if some were found
			if (Object.keys(componentCategory)?.length > 0) {
				components[categoryFile] = componentCategory;
			}
		}
	}

	return components;
};

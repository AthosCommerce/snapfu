import { existsSync, mkdirSync, promises as fsp, statSync } from 'fs';
import path from 'path';
import { exit } from 'process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import YAML from 'yaml';
import glob from 'glob';

import { editJSON } from './patch/edit-json.js';
import { editYAML } from './patch/edit-yaml.js';
import { findReplace } from './patch/find-replace.js';
import { cmp, copy, commandOutput, boxify, boxifyVersions } from './utils/index.js';
import { setupLibraryRepo } from './library.js';

export const listPatches = async (options, skipUpdate = false) => {
	if (!skipUpdate) await setupLibraryRepo(options);

	const { context } = options;
	const { integration, project } = context;
	const { framework } = integration || {};
	let startVersion = project?.version;

	if (!integration || !context.project || !context.project.path || !framework) {
		console.log(chalk.red(`Error: No Snap project found.`));
		exit(1);
	}

	if (!startVersion) {
		console.log(chalk.red(`Could not find project version in package.json`));
		exit(1);
	}

	if (options.args[1] == 'all') {
		startVersion = undefined;
	}

	const availablePatches = await getVersions(options, startVersion);

	console.log(`\n${chalk.white.bold(`Current Project Version:`)} ${startVersion && chalk.bold.cyan(startVersion)}`);

	if (availablePatches.length) {
		console.log(chalk.white.bold(`\n${startVersion ? 'Available ' : ''}Patches:`));
		availablePatches.forEach((version) => {
			if (version == startVersion) {
				console.log(chalk.cyan(`${chalk.bold(version)} (current)`));
			} else {
				console.log(`${version}`);
			}
		});
	} else {
		console.log(chalk.cyan('Project is on latest version.'));
	}
};

export const getVersions = async (options, startingAt, endingAt) => {
	const { context } = options;
	const { integration } = context;
	const { framework } = integration || {};

	// ~/.athoscommerce/snapfu-library/[athos | searchspring]/{framework}/{version}
	const frameworkPath = path.join(options.config.library.dir, options.context.project.org, framework, 'patches');
	const patchDirExists = existsSync(frameworkPath);
	let versions = [];

	if (patchDirExists) {
		const patchVersions = await fsp.readdir(path.join(frameworkPath));
		for (const file of patchVersions) {
			const filePath = path.resolve(frameworkPath, file);
			const fileStats = await fsp.stat(filePath);
			if (fileStats.isDirectory()) {
				versions.push(file);
			}
		}
		versions.sort(cmp);

		if (startingAt) {
			versions = versions.filter((version) => cmp(version, startingAt) > 0);
		}

		if (endingAt) {
			versions = versions.filter((version) => cmp(version, endingAt) <= 0);
		}
	}

	return versions;
};

export const getCustomPatchVersions = async (options) => {
	const { context } = options;
	const { integration } = context;
	const { framework } = integration || {};

	// ~/.athoscommerce/snapfu-library/[athos | searchspring]/{org}/{framework}/customPatches/{version}
	const frameworkPath = path.join(options.config.library.dir, options.context.project.org, framework, 'customPatches');
	const patchDirExists = existsSync(frameworkPath);
	let versions = [];

	if (patchDirExists) {
		const patchVersions = await fsp.readdir(path.join(frameworkPath));
		for (const file of patchVersions) {
			const filePath = path.resolve(frameworkPath, file);
			const fileStats = await fsp.stat(filePath);
			if (fileStats.isDirectory()) {
				versions.push(file);
			}
		}
	}

	return versions;
};

export const applyPatches = async (options, skipUpdate = false) => {
	if (!skipUpdate) await setupLibraryRepo(options);

	const { context } = options;
	const { integration, project } = context;
	const { framework } = integration || {};
	const [_command, versionApply] = options.args;

	if (!integration || !context.project || !context.project.path || !framework || !project.version) {
		console.log(chalk.red(`Error: No Snap project found.`));
		exit(1);
	}

	// verify project version
	if (!project.version.match(/^\w?(\d+\.\d+\.\d+-?\d*)$/)) {
		console.log('Project version invalid.');
		exit(1);
	}

	const availablePatches = await getVersions(options);
	const availableCustomPatches = await getCustomPatchVersions(options);
	let isCustomPatch = false;

	// verify requested version
	const versionMatch = /^^\w?(\d+\.\d+\.\d+)$/.exec(versionApply);
	let filteredVersionApply;

	if (versionApply == 'latest') {
		filteredVersionApply = undefined;
	} else if (versionApply && versionMatch && versionMatch.length == 2) {
		filteredVersionApply = versionMatch[1];

		// check if versionApply is included in available patches
		if (!availablePatches.includes(filteredVersionApply)) {
			console.log(`Patch version ${filteredVersionApply} does not exist.`);
			exit(1);
		}
	} else if (availableCustomPatches.includes(versionApply)) {
		// custom patch
		isCustomPatch = true;
	} else if (!versionApply) {
		console.log(chalk.yellow(`\nPatch version not provided.`));
		await listPatches(options, true);
		exit(1);
	} else {
		console.log(chalk.red('Patch version invalid.'));
		exit(1);
	}

	let patches;
	try {
		if (isCustomPatch) {
			// custom patches don't follow standard versioning, and are one-off patches
			patches = [versionApply];
		} else {
			patches = await getVersions(options, project.version, filteredVersionApply);
		}
		if (patches.length == 0) {
			console.log(`\n${chalk.bold('Nothing to patch.')}`);
			if (!filteredVersionApply) console.log(chalk.cyan('Project is on latest version.'));
			exit();
		}
	} catch (err) {
		console.log('Patch version not found.');
		exit(1);
	}

	// display transition output
	const finalVersion = patches[patches.length - 1];
	console.log(`\n${chalk.cyan.bold('Apply Patch')}`);
	console.log(chalk.cyan(boxifyVersions(` ${project.version} `, ` ${finalVersion} `)));

	if (!options?.options?.ci) {
		const question = [
			{
				type: 'confirm',
				name: 'continue',
				message: 'Do you want to continue?',
				default: true,
			},
		];

		const answer = await inquirer.prompt(question);
		if (!answer.continue) {
			exit(0);
		}
	}

	// apply patches one at a time
	for (const patch of patches) {
		console.log(chalk.cyan.bold(`\n${patch}`));
		await applyPatch(options, patch, isCustomPatch);
	}

	// modify package.json with finalVersion number
	console.log(chalk.blue(`\nfinalizing patch...`));

	// custom patches should not update the package.json version
	if (!isCustomPatch) {
		await editJSON(options, 'package.json', [{ update: { properties: { [project.org]: { version: finalVersion } } } }]);
	}

	// patching complete
	console.log();
	console.log(chalk.cyan(boxify(` ${'patching complete'} `, `site updated to ${finalVersion}`)));
};

export const applyPatch = async (options, patch, isCustomPatch) => {
	const { context } = options;
	const { integration } = context;
	const { framework, distribution } = integration || {};

	// copy over patch files into ./patch of the project directory
	const projectDir = options.context.project.path;
	const projectPatchDir = path.join(projectDir, 'patch');

	try {
		const exists = await fsp.stat(projectPatchDir);
		// delete existing patch directory
		await fsp.rm(projectPatchDir, { recursive: true, force: true });
	} catch (err) {
		// directory doesn't exist - do nothing
	}

	// copy patch files into ./patch directory in project
	await fsp.mkdir(projectPatchDir);
	const patchDir = path.join(options.config.library.dir, options.context.project.org, framework, isCustomPatch ? 'customPatches' : 'patches', patch);
	await copy(patchDir, projectPatchDir, { clobber: true });

	// read the dir and log contents
	let dirFiles = await fsp.readdir(projectPatchDir);

	// default sort is the order we want to execute the files in
	// [
	//  'maintenance.${framework}.${version}.yml',
	//  'maintenance.${framework}.snap.${version}.yml',
	//  'maintenance.${framework}.snapTemplates.${version}.yml',
	//  'patch.${framework}.${version}.yml'
	// ]
	dirFiles.sort();

	// filter files based on distribution
	dirFiles = dirFiles.filter((file) => {
		const commonFiles = [
			`maintenance.${framework}.${patch}.yml`,
			`maintenance.${framework}.${patch}.yaml`,
			`patch.${framework}.${patch}.yml`,
			`patch.${framework}.${patch}.yaml`,
		];
		const specificFile =
			distribution === 'templates'
				? [`maintenance.${framework}.snapTemplates.${patch}.yml`, `maintenance.${framework}.snapTemplates.${patch}.yaml`]
				: [`maintenance.${framework}.snap.${patch}.yml`, `maintenance.${framework}.snap.${patch}.yaml`];

		return [...commonFiles, ...specificFile].includes(file);
	});

	// execute the filtered files
	for (const file of dirFiles) {
		const filePath = path.resolve(projectPatchDir, file);
		await runPatch(options, filePath);
	}

	// clean up (remove ./patch)
	await fsp.rm(projectPatchDir, { recursive: true, force: true });
};

const runPatch = async (options, patchFile) => {
	// ingest YAML
	let patchContents;
	try {
		const yamlFile = await fsp.readFile(patchFile, 'utf8');
		patchContents = YAML.parse(yamlFile);
	} catch (err) {
		console.log(`could not parse patch file ${patchFile}`);
		exit(1);
	}

	console.log(chalk.blue(`${path.basename(patchFile)}...`));

	const { steps, runInAction } = patchContents;

	// skip running the steps in the patch file if running in the updater and patch file has runInAction flag
	if (options.options.updater && runInAction === true) {
		console.log(chalk.blue(`${path.basename(patchFile)}... skipping due to runInAction`));
		// adds a new line to README.md so that the updater can create a branch
		await fsp.appendFile('README.md', '\n');
		return;
	}

	// steps supported (file, run);
	for (const step of steps) {
		const actions = Object.keys(step);

		for (const action of actions) {
			switch (action) {
				case 'run': {
					const run = step[action];
					try {
						const commands = run.trim().split('\n');
						for (const cmd of commands) {
							console.log(chalk.italic(cmd));
							const { stdout, stderr } = await commandOutput(cmd);
							if (stdout) {
								console.log(stdout);
							}
							if (stderr) {
								console.log(stderr);
							}
						}
					} catch (e) {
						console.log('Run command encountered an error:', e);
						exit(1);
					}
					break;
				}
				case 'files': {
					const files = step[action];
					const fileGlobs = Object.keys(files);

					for (const fileGlob of fileGlobs) {
						const { action, changes } = files[fileGlob];

						try {
							// get filenames using glob - ignore `node_modules` and `patch` files
							const fileNames = glob.sync(fileGlob, { nosort: true, ignore: ['node_modules/**', 'patch/**'] });

							for (const fileName of fileNames) {
								const extension = fileName.split('.').pop();

								switch (action) {
									case 'edit-json': {
										if (['json'].includes(extension)) {
											console.log(`editing ${fileName}`);
											await editJSON(options, fileName, changes);
										}

										break;
									}
									case 'edit-yaml': {
										if (['yaml', 'yml'].includes(extension)) {
											console.log(`editing ${fileName}`);
											await editYAML(options, fileName, changes);
										}

										break;
									}
									case 'find-replace': {
										console.log(`editing ${fileName}`);
										await findReplace(options, fileName, changes);

										break;
									}
									default: {
										// FUTURE TODO: support editing other file types
										break;
									}
								}
							}
						} catch (err) {
							console.error(err);
							exit(1);
						}
					}
					break;
				}

				default: {
					break;
				}
			}
		}
	}
};

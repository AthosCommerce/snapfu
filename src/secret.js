import { exit } from 'process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { setRepoSecret } from './init.js';
import { ConfigApi } from './services/ConfigApi.js';
import { auth } from './login.js';
import { wait } from './utils/index.js';

export const setSecretKey = async (options) => {
	if (!options.context || !options.context.integration || !options.context.project || !options.context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		exit(1);
	}

	let siteIds;
	if (typeof options.context.integration.siteId === 'object') {
		siteIds = Object.keys(options.context.integration.siteId);
	}
	const questions = [
		{
			type: 'list',
			name: 'siteId',
			message: 'Please select which siteId to add/update the secretKey for:',
			choices: siteIds,
			when: () => {
				return siteIds && siteIds.length > 0;
			},
		},
		{
			type: 'input',
			name: 'secretKey',
			message: 'Please enter the secretKey as found in the SMC console (32 characters):',
			validate: (input) => {
				return input && input.length > 0 && /^[0-9a-zA-Z]{32}$/.test(input);
			},
		},
	];

	const answers = await inquirer.prompt(questions);
	console.log();

	const { secretKey } = answers;
	const siteId = answers.siteId || options.context.integration.siteId;
	const { organization, name } = options.context.repository;

	if (!siteId || !organization || !name) {
		console.log(chalk.red(`Error: Project is misconfigured.`));
		exit(1);
	}

	try {
		try {
			await new ConfigApi(secretKey, options).validateSite({ siteId });
		} catch (err) {
			console.log(chalk.red('Verification of siteId and secretKey failed.'));
			console.log(chalk.red(err));
			exit(1);
		}

		await auth.saveSecretKey(secretKey, siteId, options.config.searchspringDir);
		await setRepoSecret(options, { siteId, secretKey, organization, name });
	} catch (err) {
		console.log(chalk.red(err));
		exit(1);
	}
};

export const checkSecretKey = async (options) => {
	if (!options.context || !options.context.integration || !options.context.project || !options.context.project.path) {
		console.log(chalk.red(`Error: No Snap project found in ${process.cwd()}.`));
		exit(1);
	}

	const keys = options.user.keys || {};
	let siteId = options.context.integration.siteId;
	let name = options.context.repository.name;

	const verify = async (secretKey, siteId, name) => {
		if (secretKey) {
			try {
				await new ConfigApi(secretKey, options).validateSite({ siteId });
				console.log(chalk.green(`Verification of siteId and secretKey complete for ${name}`));

				if (options.options.ci) {
					console.log(chalk.green(`Saving secretKey for ${name} in ${options.config.searchspringDir}`));
					await auth.saveSecretKey(secretKey, siteId, options.config.searchspringDir);
				}
			} catch (err) {
				console.log(chalk.red(`Verification of siteId and secretKey failed for ${name}`));
				console.log(chalk.red(err));
				exit(1);
			}

			await wait(100);
		}
	};

	try {
		if (options.multipleSites.length) {
			for (let i = 0; i < options.multipleSites.length; i++) {
				const { secretKey, siteId, name } = options.multipleSites[i];
				await verify(secretKey, siteId, name);
			}
		} else {
			let secretKey = keys[siteId];
			await verify(secretKey, siteId, name);
		}
	} catch (err) {
		console.log(chalk.red(err));
		exit(1);
	}
};

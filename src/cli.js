import arg from 'arg';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { exit } from 'process';
import { promises as fsp } from 'fs';
import chalk from 'chalk';

import { login, logout, orgAccess, auth } from './login.js';
import { initTemplate, listTemplates, removeTemplate, syncTemplate } from './recs.js';
import { initBadgeTemplate, listBadgeTemplates, removeBadgeTemplate, syncBadgeTemplate } from './badges.js';
import { init } from './init.js';
import { listPatches, applyPatches, setupPatchRepo } from './patch.js';
import { about } from './about.js';
import { wait, cmp } from './utils/index.js';
import { help } from './help.js';
import { getContext } from './context.js';
import { setSecretKey, checkSecretKey } from './secret.js';
import { commandOutput } from './utils/index.js';

// these node variables are not available in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function parseArgumentsIntoOptions(rawArgs) {
	let args;

	try {
		args = arg(
			{
				'--dev': Boolean,
				'--zone': String,
				'--ci': Boolean,
				'--updater': Boolean,
				'--secret-key': String,
				'--secrets-ci': String,
			},
			{
				argv: rawArgs.slice(2),
			}
		);
	} catch (e) {
		console.log(`Unexpected argument provided.`);
		exit(1);
	}

	const command = args._[0];

	const context = await getContext(process.cwd());

	const searchspringDir = path.join(os.homedir(), '/.searchspring');
	const user = await auth.loadUser(searchspringDir);

	let secretKey;
	try {
		secretKey = args['--secret-key'] || user.keys[context.integration.siteId];
	} catch (e) {
		// do nothing - when running init context may not exist
	}

	let multipleSites = [];

	// drop out if not logged in for certain commands
	const requiredLoginCommands = ['logout', 'whoami', 'org-access'];
	const templatesRestrictedCommands = ['recs', 'recommendation', 'recommendations'];

	const loggedIn = user && user.token;
	const secretOptions = args['--secrets-ci'] || secretKey;

	if (requiredLoginCommands.includes(command) && !(loggedIn || secretOptions || args['--ci'])) {
		console.log(chalk.yellow(`Login is required when using the '${command}' command.`));
		exit(1);
	} else if (context.project.distribution == 'SnapTemplates' && templatesRestrictedCommands.includes(command)) {
		console.log(chalk.yellow(`The '${command}' command is not supported when using SnapTemplates.`));
		exit(0);
	}

	const getSecretKeyFromCLI = (siteId) => {
		try {
			const secrets = JSON.parse(args['--secrets-ci']);
			const secretKey = secrets[`WEBSITE_SECRET_KEY_${siteId.toUpperCase()}`];
			return secretKey;
		} catch (e) {
			return;
		}
	};

	if (context.integration && typeof context.integration.siteId === 'object') {
		const siteIds = Object.keys(context.integration.siteId);
		if (!siteIds || !siteIds.length) {
			console.log(chalk.red('siteId is empty in package.json object: ', JSON.stringify(context.integration)));
			exit(1);
		}

		multipleSites = siteIds
			.map((siteId) => {
				try {
					const { name } = context.integration.siteId[siteId];
					const secretKey = getSecretKeyFromCLI(siteId) || user.keys[siteId];

					if (!secretKey && args['--secrets-ci']) {
						console.log(
							chalk.red(`Could not find Github secret 'WEBSITE_SECRET_KEY_${siteId.toUpperCase()}' in 'secrets' input
It can be added by running 'snapfu secrets add' in the project's directory locally, 
or added manual in the project's repository secrets. 
The value can be obtained in the Searchspring Management Console.
Then ensure that you are providing 'secrets' when running the action. ie:

jobs:
  Publish:
	runs-on: ubuntu-latest
	name: Snap Action
	steps:
	  - name: Checkout action
		uses: actions/checkout@v2
		with:
		  repository: searchspring/snap-action
	  - name: Run @searchspring/snap-action
		uses: ./
		with:
		  secrets: \${{ toJSON(secrets) }}
		  ...
`)
						);
					}

					return {
						siteId,
						name,
						secretKey,
					};
				} catch (e) {
					console.log(chalk.red('The siteId object in package.json is invalid. Expected format:', JSON.stringify(context.integration)));
					console.log(
						chalk.red(`
"searchspring": {
	"siteId": {
		"xxxxx1": {
			"name": "site1.com.au"
		},
		"xxxxx2": {
			"name": "site2.hk"
		}
	},
}`)
					);
					exit(1);
				}
			})
			.filter((site) => site.secretKey);
	}

	let packageJSON = {};
	try {
		const snapfuPackageJSON = path.join(__dirname, '../package.json');
		const contents = await fsp.readFile(snapfuPackageJSON, 'utf8');
		packageJSON = JSON.parse(contents);
	} catch (e) {
		console.log('Could not determine Snapfu version.', e);
		exit(1);
	}

	return {
		config: {
			searchspringDir,
			directories: {
				components: {
					recommendation: './src/components/Recommendations',
					badge: './src/components/Badges',
				},
			},
			patches: {
				dir: path.join(searchspringDir, 'snapfu-patches'),
				repoName: 'snapfu-patches',
				repoUrl: `https://github.com/searchspring/snapfu-patches.git`,
			},
			library: {
				dir: path.join(searchspringDir, 'snapfu-library'),
				repoName: 'snapfu-library',
				repoUrl: `https://github.com/searchspring/snapfu-library.git`,
			},
		},
		user,
		dev: args['--dev'] || false,
		zone: args['--zone'],
		command,
		args: args._.slice(1),
		options: {
			secretKey,
			secrets: args['--secrets-ci'],
			ci: args['--ci'],
			updater: args['--updater'],
		},
		context,
		multipleSites,
		version: packageJSON.version,
	};
}

export async function cli(args) {
	const options = await parseArgumentsIntoOptions(args);

	switch (options.command) {
		// cases requiring user login
		// ---------------------------

		case 'init': {
			await init(options);
			break;
		}

		case 'badge':
		case 'badges': {
			function showTemplateHelp() {
				help({ command: 'help', args: ['badges'] });
			}

			if (!options.args.length) {
				showTemplateHelp();
				return;
			}

			const [command] = options.args;

			switch (command) {
				case 'init':
					await initBadgeTemplate(options);
					break;

				case 'list':
					await listBadgeTemplates(options);
					break;

				case 'archive':
					await removeBadgeTemplate(options);
					break;

				case 'sync':
					await syncBadgeTemplate(options);
					break;

				default:
					showTemplateHelp();
					break;
			}

			break;
		}

		case 'recs':
		case 'recommendation':
		case 'recommendations': {
			function showTemplateHelp() {
				help({ command: 'help', args: ['recommendation'] });
			}

			if (!options.args.length) {
				showTemplateHelp();
				return;
			}

			const [command] = options.args;

			switch (command) {
				case 'init':
					const [command, name, dir] = options.args;
					await initTemplate(options);
					break;

				case 'list':
					await listTemplates(options);
					break;

				case 'archive':
					await removeTemplate(options);
					break;

				case 'sync':
					await syncTemplate(options);
					break;

				default:
					showTemplateHelp();
					break;
			}

			break;
		}

		case 'secret':
		case 'secrets': {
			function showSecretHelp() {
				help({ command: 'help', args: ['secret'] });
			}

			if (!options.args.length) {
				showSecretHelp();
				return;
			}

			const [command] = options.args;

			switch (command) {
				case 'add':
				case 'update':
					await setSecretKey(options);
					break;

				case 'verify':
					await checkSecretKey(options);
					break;

				default:
					showSecretHelp();
					break;
			}

			break;
		}

		case 'logout': {
			try {
				await logout(options);
				console.log(`User ${chalk.cyan(options.user.login)} logged out.`);
			} catch (err) {
				console.log(chalk.red(err.message));
			}

			break;
		}

		case 'org-access': {
			orgAccess(options);
			break;
		}

		case 'whoami': {
			console.log(`${chalk.blue(options.user.name)} (${chalk.green(options.user.login)})`);
			break;
		}

		case 'patch': {
			function showPatchHelp() {
				help({ command: 'help', args: ['patch'] });
			}

			if (!options.args.length) {
				showPatchHelp();
				return;
			}

			const [command] = options.args;

			switch (command) {
				case 'apply':
					if (options.options.ci && (options.options.secrets || options.options.secretKey)) {
						// ran in the action and patches should be pulled
						await applyPatches(options, false);
					} else {
						await applyPatches(options, options.options.ci);
					}
					break;

				case 'list':
					await listPatches(options, options.options.ci);
					break;

				case 'fetch':
					await setupPatchRepo(options);
					break;

				default:
					showPatchHelp();
					break;
			}
			break;
		}

		// cases not requiring user
		// -------------------------

		case 'login': {
			try {
				const creds = await login(options);
				console.log(`Authenticated ${chalk.cyan(creds.login)}`);
			} catch (err) {
				console.log(chalk.red(err.message));
			}

			break;
		}

		case 'about': {
			about(options);
			break;
		}

		default: {
			help(options);
			break;
		}
	}

	if (!options.options.ci) await checkForLatestVersion(options);

	exit();
}

function debug(options, message) {
	if (options.dev) {
		console.log(message);
	}
}

async function checkForLatestVersion(options) {
	try {
		// using Promise.race to wait a maximum of 1.2 seconds
		const latest = await Promise.race([(await commandOutput('npm view snapfu version')).stdout.trim(), wait(1200)]);

		if (latest && cmp(latest, options.version) == 1) {
			console.log(`\n\n${chalk.bold.white(`Version ${chalk.bold.red(`${latest}`)} of snapfu available.\nUpdate with:`)}`);
			console.log(chalk.grey(`\n\tnpm install -g snapfu\n`));
		}
	} catch (e) {
		// do nothing
	}
}

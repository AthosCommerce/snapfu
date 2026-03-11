import { exit } from 'process';
import path from 'path';
import { promises as fsp } from 'fs';
import chalk from 'chalk';

import { auth } from './login.js';
import { commandOutput } from './utils/index.js';

export async function getContext(dir) {
	let project, integration, branch, branchList, remote, organization, name;
	try {
		project = await getProject(dir);
		integration = project?.packageJSON?.athos || project?.packageJSON?.searchspring;
	} catch (err) {
		// do nothing
	}

	try {
		branchList = (await commandOutput('git branch', dir)).stdout.trim();
		branch = (await commandOutput('git branch --show-current', dir)).stdout.trim();
		remote = (await commandOutput('git config --get remote.origin.url', dir)).stdout.trim();
	} catch (err) {
		// do nothing
	}

	if (remote) {
		// Removing the .git at the end
		remote = remote.trim().replace(/\.git\/?$/, '');

		let path = [];

		// If URL contains an @ it's an SSH repository URL
		if (remote.indexOf('@') > -1) {
			// Splitting the string at the : and taking the second value
			path = remote.split(':')[1]?.split('/');
		} else {
			// Just split the string at /
			path = remote?.split('/');
		}

		if (path && path.length > 1) {
			// Name is the last value in the path
			name = path[path.length - 1];

			// Organization is the second to last value in the path
			organization = path[path.length - 2];
		}
	}

	return {
		project,
		repository: {
			remote,
			name,
			organization,
			branch,
			branchList,
		},
		integration,
	};
}

export async function getProject(dir) {
	try {
		const [packageFile] = await getClosest(dir || process.cwd(), 'package.json');

		if (packageFile) {
			// parse the contents
			const contents = await fsp.readFile(packageFile, 'utf8');
			const parsedContents = JSON.parse(contents);

			// determine project codebase
			// if index.ts or index.tsx exists, assume typescript
			let type = 'javascript';
			let distribution = 'Snap';
			const org = parsedContents.athos ? 'athos' : parsedContents.searchspring ? 'searchspring' : null;
			if (org) {
				try {
					// check for ts
					const file = path.join(path.dirname(packageFile), 'src', 'index.ts');
					await fsp.stat(file);
					type = 'typescript';

					const contents = await fsp.readFile(file, 'utf8');
					if (contents.includes('new SnapTemplates(')) {
						distribution = 'SnapTemplates';
					}
				} catch (err) {
					// check for tsx
					try {
						const file = path.join(path.dirname(packageFile), 'src', 'index.tsx');
						await fsp.stat(file);
						type = 'typescript';

						const contents = await fsp.readFile(file, 'utf8');
						if (contents.includes('new SnapTemplates(')) {
							distribution = 'SnapTemplates';
						}
					} catch (err) {
						// do nothing because it is likely a JS project
					}
				}
			}

			const projectDetails = {
				path: path.dirname(packageFile),
				dirname: path.basename(path.dirname(packageFile)),
				type,
				distribution,
				packageJSON: parsedContents,
				org,
				version: parsedContents[org]?.version ?? '0.0.0',
			};

			if (!projectDetails.org) {
				console.log(chalk.red(`Error: project package.json file is missing key 'athos' or 'searchspring'`));
				exit(1);
			}
			if (Object.keys(parsedContents[projectDetails.org]).length === 0) {
				console.log(chalk.red(`Error: project package.json file is missing ${projectDetails.org} configuration`));
				exit(1);
			}
			if (parsedContents['searchspring'] && parsedContents['athos']) {
				console.log(chalk.red(`Error: project package.json file contains both 'athos' and 'searchspring' keys`));
				exit(1);
			}

			const siteId = parsedContents[projectDetails.org].siteId;
			if (siteId && typeof siteId === 'string') {
				const isValid =
					projectDetails.org === 'athos'
						? siteId.startsWith('at') && /^[0-9a-z]{6}$/.test(siteId)
						: !siteId.startsWith('at') && /^[0-9a-z]{6}$/.test(siteId);
				if (!isValid) {
					console.log(chalk.red(`Error: project package.json '${projectDetails.org}' configuration contains an invalid siteId.`));
					exit(1);
				}
			} else if (siteId && typeof siteId === 'object') {
				const allSiteIdsCorrect = Object.keys(siteId).every((siteId) => {
					if (projectDetails.org === 'athos') {
						return siteId.startsWith('at') && /^[0-9a-z]{6}$/.test(siteId);
					} else {
						return !siteId.startsWith('at') && /^[0-9a-z]{6}$/.test(siteId);
					}
				});
				if (!allSiteIdsCorrect) {
					console.log(chalk.red(`Error: project package.json '${projectDetails.org}' configuration contains an invalid siteId.`));
					exit(1);
				}
			}
			return projectDetails;
		}

		return {};
	} catch (err) {
		throw err;
	}
}

export async function getClosest(dir, fileName) {
	const rootDir = path.parse(dir).root;
	let results = [];

	try {
		const dirFiles = await fsp.readdir(dir);

		for (const file of dirFiles) {
			const filePath = path.resolve(dir, file);

			if (file == fileName) {
				results.push(filePath);
			}
		}

		if (!results.length && dir != rootDir) {
			const dirResults = await getClosest(path.resolve(dir, '../'), fileName);
			results = results.concat(dirResults);
		}
	} catch (err) {
		throw new Error('failed to getFiles!');
	}

	return results;
}

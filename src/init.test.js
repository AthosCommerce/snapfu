import { createDir, pushScaffold, setBranchProtection, DEFAULT_BRANCH, SNAP_BOTS_TEAM_ID } from './init';
import { copyTransform, commandOutput } from './utils';
import { Octokit } from '@octokit/rest';
import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';
import { fail } from 'assert';
import { Readable } from 'stream';
import MemoryStream from 'memorystream';

jest.mock('@octokit/rest', () => ({ Octokit: jest.fn() }));

beforeEach(async () => {});

describe('check empty dir', () => {
	it('is empty', async () => {
		let folder = await fs.mkdtemp(path.join(os.tmpdir(), 'snapfutest-')).then(async (folder, err) => {
			if (err) throw err;
			await fs.writeFile(folder + '/somefile.txt', 'some content');
			return folder;
		});
		await createDir(folder)
			.then(() => {
				fail();
			})
			.catch((err) => {
				expect(err).toEqual(`Cannot initialize non-empty directory: ${folder}`);
			});
	});
});

describe('transforms', () => {
	it('replaces variables', async () => {
		let buf = Buffer.from('name {{ snapfu.name}} by {{ snapfu.author }}', 'utf8');
		let write = MemoryStream.createWriteStream();
		let variables = {
			'snapfu.name': 'destination name',
			'snapfu.author': 'codeallthethingz',
		};
		copyTransform(Readable.from(buf), write, variables, {
			name: 'package.json',
		});

		write.on('end', () => {
			expect(write.toString()).toEqual('name destination name by codeallthethingz');
		});

		write = MemoryStream.createWriteStream();
		copyTransform(Readable.from(buf), write, variables, {
			name: 'package.yml',
		});

		write.on('end', () => {
			expect(write.toString()).toEqual('name destination name by codeallthethingz');
		});
	});
	it('will not replace for all file types', async () => {
		let read = Readable.from(Buffer.from('{{snapfu.name}}', 'utf8'));
		let write = MemoryStream.createWriteStream();
		await copyTransform(
			read,
			write,
			{
				'snapfu.name': 'destination name',
			},
			{ name: 'something.icon' }
		);

		write.on('end', () => {
			expect(write.toString()).toEqual('{{snapfu.name}}');
		});
	});
});

describe('pushScaffold', () => {
	let logSpy;

	beforeEach(() => {
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	// creates a bare "remote" repo seeded with an initial commit on the default branch (mimics GitHub auto_init + rename)
	// and a local clone of it (mimics the clone step in init)
	const setupRepos = async () => {
		const base = await fs.mkdtemp(path.join(os.tmpdir(), 'snapfutest-push-'));
		const seed = path.join(base, 'seed');
		const remote = path.join(base, 'remote.git');
		const local = path.join(base, 'local');

		await fs.mkdir(seed);
		await commandOutput('git init -q', seed);
		await commandOutput(`git checkout -q -b ${DEFAULT_BRANCH}`, seed);
		await commandOutput('git config user.email snapfu@test.com && git config user.name snapfu', seed);
		await fs.writeFile(path.join(seed, 'README.md'), '# seed');
		await commandOutput('git add -A && git commit -q -m "Initial commit"', seed);

		await commandOutput(`git clone -q --bare ${seed} ${remote}`, base);
		await commandOutput(`git clone -q ${remote} ${local}`, base);
		await commandOutput('git config user.email snapfu@test.com && git config user.name snapfu', local);

		return { remote, local };
	};

	const remoteLog = async (remote) => {
		const { stdout } = await commandOutput(`git log ${DEFAULT_BRANCH} --format=%s`, remote);
		return stdout.trim().split('\n');
	};

	it('skips when in dev mode', async () => {
		const { remote, local } = await setupRepos();
		await fs.writeFile(path.join(local, 'package.json'), '{}');

		const result = await pushScaffold({ dev: true }, { dir: local, scaffold: 'snapfu-scaffold-preact' });

		expect(result).toBe(false);
		expect(await remoteLog(remote)).toEqual(['Initial commit']);
	});

	it('commits and pushes scaffold files to the default branch', async () => {
		const { remote, local } = await setupRepos();
		await fs.writeFile(path.join(local, 'package.json'), '{ "name": "scaffold" }');
		await fs.writeFile(path.join(local, 'README.md'), '# scaffold');

		const result = await pushScaffold({ dev: false }, { dir: local, scaffold: 'snapfu-scaffold-preact' });

		expect(result).toBe(true);
		expect(await remoteLog(remote)).toEqual(['Initialized from snapfu-scaffold-preact - [skip actions]', 'Initial commit']);

		const { stdout } = await commandOutput(`git ls-tree --name-only ${DEFAULT_BRANCH}`, remote);
		expect(stdout.trim().split('\n').sort()).toEqual(['README.md', 'package.json']);

		const { stdout: readme } = await commandOutput(`git show ${DEFAULT_BRANCH}:README.md`, remote);
		expect(readme).toEqual('# scaffold');
	});

	it('reports success without committing when there is nothing to commit', async () => {
		const { remote, local } = await setupRepos();

		const result = await pushScaffold({ dev: false }, { dir: local, scaffold: 'snapfu-scaffold-preact' });

		expect(result).toBe(true);
		expect(await remoteLog(remote)).toEqual(['Initial commit']);
	});

	it('returns false (without throwing) when the push fails', async () => {
		const { remote, local } = await setupRepos();
		await commandOutput('git remote remove origin', local);
		await fs.writeFile(path.join(local, 'package.json'), '{}');

		const result = await pushScaffold({ dev: false }, { dir: local, scaffold: 'snapfu-scaffold-preact' });

		expect(result).toBe(false);
		expect(await remoteLog(remote)).toEqual(['Initial commit']);
	});
});

describe('setBranchProtection', () => {
	let logSpy;
	let createRepoRuleset;

	beforeEach(() => {
		logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
		createRepoRuleset = jest.fn().mockResolvedValue({ status: 201 });
		Octokit.mockImplementation(() => ({ rest: { repos: { createRepoRuleset } } }));
	});

	afterEach(() => {
		logSpy.mockRestore();
	});

	it('lets the Snap Bots team bypass the Production ruleset', async () => {
		await setBranchProtection({ user: { token: 'token' } }, { organization: 'snap-implementations', name: 'test.one.test' });

		expect(createRepoRuleset).toHaveBeenCalledTimes(1);
		expect(createRepoRuleset.mock.calls[0][0]).toMatchObject({
			owner: 'snap-implementations',
			repo: 'test.one.test',
			name: 'Production',
			bypass_actors: [{ actor_id: SNAP_BOTS_TEAM_ID, actor_type: 'Team', bypass_mode: 'always' }],
		});
	});
});

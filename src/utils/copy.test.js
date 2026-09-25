import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { copy, copyTransform } from './copy';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'snapfutest-copy-'));

// writes a tree from an object: { 'a.txt': 'content', dir: { 'b.txt': '...' } }
const writeTree = async (root, tree) => {
	for (const [name, value] of Object.entries(tree)) {
		const target = path.join(root, name);
		if (typeof value === 'string') {
			await fs.writeFile(target, value);
		} else {
			await fs.mkdir(target, { recursive: true });
			await writeTree(target, value);
		}
	}
};

// reads a tree back into the same object shape
const readTree = async (root) => {
	const tree = {};
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		const target = path.join(root, entry.name);
		tree[entry.name] = entry.isDirectory() ? await readTree(target) : await fs.readFile(target, 'utf8');
	}
	return tree;
};

describe('copy', () => {
	it('copies nested directories and dotfiles', async () => {
		const source = await tmp();
		const destination = await tmp();
		const tree = {
			'.gitignore': 'node_modules',
			'README.md': '# hello',
			'.github': { workflows: { 'deploy.yml': 'on: push' } },
			src: { 'index.js': 'export default 1;', components: { 'a.jsx': '<A />' } },
			empty: {},
		};
		await writeTree(source, tree);

		await copy(source, destination, { clobber: true });

		expect(await readTree(destination)).toEqual(tree);
	});

	it('rejects when the source does not exist', async () => {
		const destination = await tmp();
		await expect(copy(path.join(destination, 'missing'), destination, { clobber: true })).rejects.toBeTruthy();
	});

	it('applies filter to files and directories', async () => {
		const source = await tmp();
		const destination = await tmp();
		await writeTree(source, {
			'.git': { HEAD: 'ref: refs/heads/production' },
			'snapfu.config.yml': 'variables: []',
			'README.md': '# hello',
			src: { 'index.js': '1' },
		});
		const excludeList = ['.git', 'snapfu.config.yml'];

		await copy(source, destination, {
			clobber: true,
			filter: (name) => excludeList.every((entry) => name != path.join(source, entry)),
		});

		expect(await readTree(destination)).toEqual({ 'README.md': '# hello', src: { 'index.js': '1' } });
	});

	it('applies rename to files', async () => {
		const source = await tmp();
		const destination = await tmp();
		await writeTree(source, { 'default.jsx': '<Default />', 'default.scss': '.default {}', 'other.js': '1' });

		await copy(source, destination, {
			clobber: true,
			rename: (name) => {
				const details = path.parse(name);
				if (details.ext && details.name === 'default') {
					details.name = 'MyComponent';
					delete details.base;
					return path.format(details);
				}
				return name;
			},
		});

		expect(await readTree(destination)).toEqual({ 'MyComponent.jsx': '<Default />', 'MyComponent.scss': '.default {}', 'other.js': '1' });
	});

	it('applies transform', async () => {
		const source = await tmp();
		const destination = await tmp();
		await writeTree(source, { 'package.json': '{ "name": "{{ snapfu.name }}" }', 'logo.icon': '{{ snapfu.name }}' });
		const variables = { 'snapfu.name': 'my-site' };

		await copy(source, destination, {
			clobber: true,
			transform: async (read, write, file) => {
				await copyTransform(read, write, variables, file);
			},
		});

		expect(await readTree(destination)).toEqual({ 'package.json': '{ "name": "my-site" }', 'logo.icon': '{{ snapfu.name }}' });
	});

	it('overwrites existing files when clobber is true', async () => {
		const source = await tmp();
		const destination = await tmp();
		await writeTree(source, { 'README.md': '# scaffold', 'new.js': '1' });
		await writeTree(destination, { 'README.md': '# existing', 'keep.js': '2' });

		await copy(source, destination, { clobber: true });

		expect(await readTree(destination)).toEqual({ 'README.md': '# scaffold', 'new.js': '1', 'keep.js': '2' });
	});

	it('leaves existing files alone when clobber is false', async () => {
		const source = await tmp();
		const destination = await tmp();
		await writeTree(source, { 'README.md': '# scaffold', 'new.js': '1' });
		await writeTree(destination, { 'README.md': '# existing' });

		await copy(source, destination, { clobber: false });

		expect(await readTree(destination)).toEqual({ 'README.md': '# existing', 'new.js': '1' });
	});

	it('resolves only after every file is fully written when clobbering an existing file', async () => {
		// mirrors init: destination already has a README.md (from the GitHub auto_init clone),
		// scaffold copy clobbers it while other (larger) files are still being written
		const source = await tmp();
		const destination = await tmp();
		const big = 'const x = "{{ snapfu.name }}";\n'.repeat(200000); // ~6MB, goes through transform
		await writeTree(source, { 'README.md': '# scaffold', 'big.js': big, src: { 'index.js': '1' } });
		await writeTree(destination, { 'README.md': '# existing' });
		const variables = { 'snapfu.name': 'my-site' };

		await copy(source, destination, {
			clobber: true,
			filter: (name) => name != path.join(source, '.git'),
			transform: async (read, write, file) => {
				await copyTransform(read, write, variables, file);
			},
		});

		const written = await fs.readFile(path.join(destination, 'big.js'), 'utf8');
		expect(written.length).toEqual(big.replace(/{{ snapfu.name }}/g, 'my-site').length);
		expect(await fs.readFile(path.join(destination, 'README.md'), 'utf8')).toEqual('# scaffold');
		expect(await fs.readFile(path.join(destination, 'src', 'index.js'), 'utf8')).toEqual('1');
	});

	it('recreates symlinks', async () => {
		const source = await tmp();
		const destination = await tmp();
		await writeTree(source, { 'real.txt': 'real' });
		await fs.symlink('real.txt', path.join(source, 'link.txt'));

		await copy(source, destination, { clobber: true });

		const stat = await fs.lstat(path.join(destination, 'link.txt'));
		expect(stat.isSymbolicLink()).toBe(true);
		expect(await fs.readlink(path.join(destination, 'link.txt'))).toEqual('real.txt');
	});
});

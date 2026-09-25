import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { finished, pipeline } from 'stream/promises';
import path from 'path';
import replaceStream from 'replacestream';

/**
 * Recursively copies `source` into `destination`, resolving only once every file has been fully written.
 */
export async function copy(source, destination, options = {}) {
	const clobber = options.clobber !== false;
	const sourceRoot = path.resolve(source);
	const destinationRoot = path.resolve(destination);

	const exists = async (target) => {
		try {
			await fs.lstat(target);
			return true;
		} catch (err) {
			if (err.code === 'ENOENT') return false;
			throw err;
		}
	};

	const copyFile = async (sourcePath, targetPath, stats) => {
		if (options.rename) {
			targetPath = options.rename(targetPath);
		}

		if (await exists(targetPath)) {
			if (!clobber) return;
			await fs.rm(targetPath, { force: true });
		}

		const read = createReadStream(sourcePath);
		const write = createWriteStream(targetPath, { mode: stats.mode });

		if (options.transform) {
			const file = { name: sourcePath, mode: stats.mode, mtime: stats.mtime, atime: stats.atime };
			await options.transform(read, write, file);
			// the transform is responsible for piping - wait for both ends to fully complete
			await Promise.all([finished(read), finished(write)]);
		} else {
			await pipeline(read, write);
		}
	};

	const copyLink = async (sourcePath, targetPath) => {
		if (await exists(targetPath)) {
			if (!clobber) return;
			await fs.rm(targetPath, { force: true });
		}

		await fs.symlink(await fs.readlink(sourcePath), targetPath);
	};

	const copyEntry = async (sourcePath) => {
		if (options.filter && !options.filter(sourcePath)) return;

		const stats = await fs.lstat(sourcePath);
		const targetPath = path.join(destinationRoot, path.relative(sourceRoot, sourcePath));

		if (stats.isDirectory()) {
			await fs.mkdir(targetPath, { recursive: true, mode: stats.mode });
			for (const entry of await fs.readdir(sourcePath)) {
				await copyEntry(path.join(sourcePath, entry));
			}
		} else if (stats.isSymbolicLink()) {
			await copyLink(sourcePath, targetPath);
		} else if (stats.isFile()) {
			await copyFile(sourcePath, targetPath, stats);
		}
	};

	await copyEntry(sourceRoot);
}

export const copyTransform = function (read, write, variables, file) {
	if (
		file.name.endsWith('.md') ||
		file.name.endsWith('.html') ||
		file.name.endsWith('.json') ||
		file.name.endsWith('.yml') ||
		file.name.endsWith('.scss') ||
		file.name.endsWith('.sass') ||
		file.name.endsWith('.jsx') ||
		file.name.endsWith('.ts') ||
		file.name.endsWith('.tsx') ||
		file.name.endsWith('.js')
	) {
		// create and pipe through multiple replaceStreams
		let pipeline = read;
		Object.keys(variables).forEach(function (variable) {
			let value = variables[variable];
			let regex = new RegExp('{{\\s*' + variable + '\\s*}}', 'gi');
			pipeline = pipeline.pipe(replaceStream(regex, value));
		});

		pipeline.pipe(write);
		// write.write(content);
	} else {
		read.pipe(write);
	}
};

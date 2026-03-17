import chalk from 'chalk';

export const about = (options) => {
	console.log(
		`${chalk.cyanBright('snap · fu')} ${chalk.grey(' ~ ')} ${chalk.cyan.italic('"the way of snap"')}  ${chalk.red(`(v${options.version})`)}\n`
	);
	console.log(`${chalk.grey('─────────────────────────────────────────────')}\n`);
	console.log(`${chalk.bold.grey('https://github.com/AthosCommerce/snap')}`);
};

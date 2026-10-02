import { validateTemplateParameters, ALLOWED_PARAMETER_TYPES } from './validateParameters';

describe('validateTemplateParameters function', () => {
	it('returns no errors for valid parameters', () => {
		const parameters = [
			{
				name: 'rgba_color',
				type: 'color',
				label: 'rgba_color',
				description: 'rgba color',
				defaultValue: 'rgba(5, 52, 53, 0)',
			},
			{
				name: 'integer',
				type: 'integer',
				label: 'integer',
				description: 'enter a whole number',
				defaultValue: '123',
				validations: {
					min: 1,
					max: 200,
				},
			},
			{
				name: 'layout',
				type: 'array',
				label: 'Layout',
				description: 'layout of the results',
				defaultValue: 'carousel',
				options: ['carousel', 'grid'],
			},
		];
		expect(validateTemplateParameters(parameters)).toStrictEqual([]);
	});

	it('requires an array', () => {
		const errors = validateTemplateParameters(123);
		expect(errors).toStrictEqual([`template paramater 'parameters' must be an array`]);
	});

	it('uses the provided detail name in error messages', () => {
		const errors = validateTemplateParameters(123, 'customDetail');
		expect(errors).toStrictEqual([`template paramater 'customDetail' must be an array`]);
	});

	it('requires name, label and description on every parameter', () => {
		const errors = validateTemplateParameters([{ type: 'string' }]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters[0].name' is required`,
			`template paramater 'parameters[0].label' is required`,
			`template paramater 'parameters[0].description' is required`,
		]);
	});

	it('does not report duplicates for parameters missing name or label', () => {
		const errors = validateTemplateParameters([{ description: 'first' }, { description: 'second' }]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters[0].name' is required`,
			`template paramater 'parameters[0].label' is required`,
			`template paramater 'parameters[1].name' is required`,
			`template paramater 'parameters[1].label' is required`,
		]);
	});

	it('rejects unknown parameter keys', () => {
		const errors = validateTemplateParameters([{ name: 'title', label: 'Title', description: 'the title', unknown: 'key' }]);
		expect(errors).toStrictEqual([`template paramater 'parameters[0].unknown' is not a valid parameter`]);
	});

	it('rejects invalid parameter types', () => {
		const errors = validateTemplateParameters([{ name: 'title', type: 'blah', label: 'Title', description: 'the title' }]);
		expect(errors).toContain(`template paramater 'parameters[0].type' must be one of allowed types: ${ALLOWED_PARAMETER_TYPES.join(', ')}`);
	});

	it('does not require type by default', () => {
		const errors = validateTemplateParameters([{ name: 'title', label: 'Title', description: 'the title', defaultValue: 'Products' }]);
		expect(errors).toStrictEqual([]);
	});

	it('requires type when requireType option is set', () => {
		const errors = validateTemplateParameters([{ name: 'title', label: 'Title', description: 'the title', defaultValue: 'Products' }], 'parameters', {
			requireType: true,
		});
		expect(errors).toStrictEqual([`template paramater 'parameters[0].type' is required`]);
	});

	it('validates type specific rules', () => {
		const errors = validateTemplateParameters([
			{
				name: 'layout',
				type: 'array',
				label: 'Layout',
				description: 'layout of the results',
				defaultValue: 'blah',
				options: ['carousel', 'grid'],
			},
			{
				name: 'limit',
				type: 'integer',
				label: 'Limit',
				description: 'number of results',
				defaultValue: '100',
				validations: {
					min: 1,
					max: 20,
				},
			},
			{
				name: 'enabled',
				type: 'toggle',
				label: 'Enabled',
				description: 'enable the thing',
				validations: {
					min: 1,
				},
			},
		]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters[0].defaultValue' must be one of the options in 'options' array`,
			`template paramater 'parameters[1].defaultValue' must not exceed 20 (validations.max)`,
			`template paramater 'parameters[2].validations' should not be used with type: 'boolean', 'checkbox', 'toggle'`,
		]);
	});

	it('reports an error instead of throwing when validations is not an object', () => {
		const invalidValidations = ['foo', 123, true, null];
		invalidValidations.forEach((validations) => {
			const errors = validateTemplateParameters([{ name: 'title', type: 'string', label: 'Title', description: 'the title', validations }]);
			expect(errors).toStrictEqual([`template paramater 'parameters[0].validations' must be an object`]);
		});
	});

	it('rejects boolean, checkbox and toggle defaultValues that are not boolean-like strings', () => {
		['boolean', 'checkbox', 'toggle'].forEach((type) => {
			const errors = validateTemplateParameters([{ name: 'enabled', type, label: 'Enabled', description: 'enable the thing', defaultValue: 'blah' }]);
			expect(errors).toStrictEqual([`template paramater 'parameters[0].defaultValue' must be a string containing 'true', '1', 'false', '0'`]);
		});
	});

	it('accepts boolean-like string defaultValues', () => {
		['true', '1', 'false', '0'].forEach((defaultValue) => {
			const errors = validateTemplateParameters([
				{ name: 'enabled', type: 'toggle', label: 'Enabled', description: 'enable the thing', defaultValue },
			]);
			expect(errors).toStrictEqual([]);
		});
	});

	it('validates string regex rules', () => {
		const errors = validateTemplateParameters([
			{
				name: 'title',
				type: 'string',
				label: 'Title',
				description: 'the title',
				defaultValue: 'abc',
				validations: { regex: '^[0-9]+$', regexExplain: 'numbers only' },
			},
		]);
		expect(errors).toStrictEqual([`template paramater 'parameters[0].defaultValue' must match the regex pattern in 'validations.regex'`]);
	});

	it('requires regexExplain when regex is used', () => {
		const errors = validateTemplateParameters([
			{ name: 'title', type: 'string', label: 'Title', description: 'the title', validations: { regex: '^[0-9]+$' } },
		]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters[0].validations' When using regex, please also provide regexExplain`,
			`template paramater 'parameters[0].validations' When using regex, please also provide regexExplain`,
		]);
	});

	it('validates string defaultValue length against min and max', () => {
		const tooShort = validateTemplateParameters([
			{ name: 'title', type: 'string', label: 'Title', description: 'the title', defaultValue: 'hi', validations: { min: 5, max: 10 } },
		]);
		expect(tooShort).toStrictEqual([`template paramater 'parameters[0].defaultValue' must be at least 5 characters long`]);

		const tooLong = validateTemplateParameters([
			{ name: 'title', type: 'string', label: 'Title', description: 'the title', defaultValue: 'hello world!', validations: { min: 1, max: 10 } },
		]);
		expect(tooLong).toStrictEqual([`template paramater 'parameters[0].defaultValue' must not exceed 10 characters long`]);
	});

	it('validates color defaultValue is a valid rgba color', () => {
		const errors = validateTemplateParameters([{ name: 'color', type: 'color', label: 'Color', description: 'the color', defaultValue: 'blue' }]);
		expect(errors).toStrictEqual([`template paramater 'parameters[0].defaultValue' must be a valid rgba color`]);
	});

	it('rejects validations on color parameters', () => {
		const errors = validateTemplateParameters([{ name: 'color', type: 'color', label: 'Color', description: 'the color', validations: { min: 1 } }]);
		expect(errors).toStrictEqual([`template paramater 'parameters[0].validations' should not be used with type: 'color'`]);
	});

	it('rejects regex validations on integer and decimal parameters', () => {
		const errors = validateTemplateParameters([
			{
				name: 'limit',
				type: 'decimal',
				label: 'Limit',
				description: 'number of results',
				validations: { regex: '^[0-9]+$', regexExplain: 'numbers only' },
			},
		]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters[0].validations.regex' or 'parameters[0].validations.regexExplain' should not be used with type: 'integer' or 'decimal'`,
		]);
	});

	it('rejects decimal defaultValues that are not numeric strings', () => {
		const errors = validateTemplateParameters([
			{ name: 'limit', type: 'decimal', label: 'Limit', description: 'number of results', defaultValue: 'abc', validations: { min: 1 } },
		]);
		expect(errors).toStrictEqual([`template paramater 'parameters[0].defaultValue' must be a string containing a number`]);
	});

	it('rejects integer min and max that are not whole numbers', () => {
		const errors = validateTemplateParameters([
			{ name: 'limit', type: 'integer', label: 'Limit', description: 'number of results', validations: { min: 1.5, max: 10.5 } },
		]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters[0].validations.min' must be an integer`,
			`template paramater 'parameters[0].validations.max' must be an integer`,
		]);
	});

	it('rejects negative min and max validations for length based parameters', () => {
		const minErrors = validateTemplateParameters([
			{ name: 'title', type: 'string', label: 'Title', description: 'the title', validations: { min: -1 } },
		]);
		expect(minErrors).toStrictEqual([`template paramater 'parameters[0].validations.min' must not be a number below 0`]);

		const maxErrors = validateTemplateParameters([
			{ name: 'title', type: 'string', label: 'Title', description: 'the title', validations: { max: -1 } },
		]);
		expect(maxErrors).toStrictEqual([`template paramater 'parameters[0].validations.max' must not be a number below 0`]);
	});

	it('allows negative min and max validations for integer and decimal parameters', () => {
		const errors = validateTemplateParameters([
			{ name: 'zindex', type: 'integer', label: 'Z-index', description: 'set a z-index', validations: { min: -1, max: 2147483647 } },
			{ name: 'offset', type: 'decimal', label: 'Offset', description: 'set an offset', defaultValue: '-0.5', validations: { min: -1.5, max: 1.5 } },
		]);
		expect(errors).toStrictEqual([]);
	});

	it('rejects min and max validations that are not numbers', () => {
		const errors = validateTemplateParameters([{ name: 'title', label: 'Title', description: 'the title', validations: { min: '1', max: '5' } }]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters[0].validations.min' must be a number`,
			`template paramater 'parameters[0].validations.max' must be a number`,
		]);
	});

	it('rejects min greater than max', () => {
		const errors = validateTemplateParameters([
			{ name: 'title', type: 'string', label: 'Title', description: 'the title', validations: { min: 10, max: 5 } },
		]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters[0].validations.min' must be a number lower than 'validations.max'`,
			`template paramater 'parameters[0].validations.min' must be a number lower than 'parameters[0].validations.max'`,
		]);
	});

	it('rejects duplicate parameter names and labels', () => {
		const errors = validateTemplateParameters([
			{ name: 'title', type: 'string', label: 'Title', description: 'the title' },
			{ name: 'title', type: 'string', label: 'Title', description: 'the other title' },
		]);
		expect(errors).toStrictEqual([
			`template paramater 'parameters' contains duplicate parameter names: 'title'`,
			`template paramater 'parameters' contains duplicate parameter labels: 'Title'`,
		]);
	});
});

export const ALLOWED_PARAMETER_TYPES = ['array', 'string', 'color', 'url', 'integer', 'decimal', 'boolean', 'checkbox', 'toggle'];

// validates template parameters (shared by badge and recommendation templates)
// returns an array of error messages (empty when valid)
export function validateTemplateParameters(parameters, detail = 'parameters', { requireType = false } = {}) {
	const invalidParam = [];

	if (!Array.isArray(parameters)) {
		invalidParam.push(`template paramater '${detail}' must be an array`);
		return invalidParam;
	}

	const uniqueNames = [];
	const uniqueLabels = [];

	parameters.forEach((parameter, i) => {
		uniqueNames.push(parameter['name']);
		uniqueLabels.push(parameter['label']);

		const requiredFields = requireType ? ['name', 'type', 'label', 'description'] : ['name', 'label', 'description'];
		requiredFields.forEach((field) => {
			if (!(field in parameter)) {
				invalidParam.push(`template paramater '${detail}[${i}].${field}' is required`);
			}
		});

		Object.keys(parameter).forEach((key) => {
			if (!['name', 'type', 'label', 'description', 'defaultValue', 'validations', 'options'].includes(key)) {
				invalidParam.push(`template paramater '${detail}[${i}].${key}' is not a valid parameter`);
			}
			if (['name', 'type', 'label', 'description', 'defaultValue'].includes(key) && (typeof parameter[key] !== 'string' || !parameter[key])) {
				invalidParam.push(`template paramater '${detail}[${i}].${key}' must be a string with a value`);
			}
			if (key === 'type') {
				if (!ALLOWED_PARAMETER_TYPES.includes(parameter[key])) {
					invalidParam.push(`template paramater '${detail}[${i}].${key}' must be one of allowed types: ${ALLOWED_PARAMETER_TYPES.join(', ')}`);
				}
				const { options, defaultValue, validations } = parameters[i];
				const { min, max, regex, regexExplain } = validations || {};
				switch (parameter[key]) {
					case 'array':
						if (!options || !Array.isArray(options) || options.length === 0) {
							invalidParam.push(`template paramater '${detail}[${i}].options' must be an array with at least 1 option when type: 'array' is used`);
						}
						if (defaultValue && !options?.includes(defaultValue)) {
							invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be one of the options in 'options' array`);
						}
						if (validations) {
							invalidParam.push(`template paramater '${detail}[${i}].validations' should not be used with type: 'array'`);
						}
						break;
					case 'string':
					case 'url':
						if (validations) {
							if (min && typeof min !== 'number') {
								invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be a number`);
							}
							if (max && typeof max !== 'number') {
								invalidParam.push(`template paramater '${detail}[${i}].validations.max' must be a number`);
							}
							if (min && max && min > max) {
								invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be a number lower than 'validations.max'`);
							}
							if (regex && typeof regex !== 'string') {
								invalidParam.push(`template paramater '${detail}[${i}].validations.regex' must be a string`);
							}
							if (regex && !regexExplain) {
								invalidParam.push(`template paramater '${detail}[${i}].validations' When using regex, please also provide regexExplain`);
							}
							if (regexExplain && typeof regexExplain !== 'string') {
								invalidParam.push(`template paramater '${detail}[${i}].validations.regexExplain' must be a string`);
							}
							if (defaultValue && regex && !new RegExp(regex).test(defaultValue)) {
								invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must match the regex pattern in 'validations.regex'`);
							}
							if (defaultValue && min && defaultValue.length < min && min > 0) {
								invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be at least ${min} characters long`);
							}
							if (defaultValue && max && defaultValue.length > max && max > 0) {
								invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must not exceed ${max} characters long`);
							}
						}
						break;
					case 'color':
						if (validations) {
							invalidParam.push(`template paramater '${detail}[${i}].validations' should not be used with type: 'color'`);
						}
						const rgbaMatch = /^rgba\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1}(\.\d{1,2})?)\)$/;
						if (defaultValue && !new RegExp(rgbaMatch).test(defaultValue)) {
							invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be a valid rgba color`);
						}
						break;
					case 'integer':
						if (min && min % 1 !== 0) {
							invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be an integer`);
						}
						if (max && max % 1 !== 0) {
							invalidParam.push(`template paramater '${detail}[${i}].validations.max' must be an integer`);
						}
					// no break intentional
					case 'decimal':
						if (validations) {
							if (regex || regexExplain) {
								invalidParam.push(
									`template paramater '${detail}[${i}].validations.regex' or '${detail}[${i}].validations.regexExplain' should not be used with type: 'integer' or 'decimal'`
								);
							}
							if (min && typeof min !== 'number') {
								invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be a number`);
							}
							if (max && typeof max !== 'number') {
								invalidParam.push(`template paramater '${detail}[${i}].validations.max' must be a number`);
							}
							if (min && max && min > max) {
								invalidParam.push(`template paramater '${detail}[${i}].validations.min' must be a number lower than 'validations.max'`);
							}
							if (defaultValue && (typeof defaultValue !== 'string' || isNaN(Number(defaultValue)))) {
								invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be a string containing a number`);
							}
							if (defaultValue && min && Number(defaultValue) < min) {
								invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be at least ${min} (validations.min)`);
							}
							if (defaultValue && max && Number(defaultValue) > max) {
								invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must not exceed ${max} (validations.max)`);
							}
						}
						break;
					case 'boolean':
					case 'checkbox':
					case 'toggle':
						if (validations) {
							invalidParam.push(`template paramater '${detail}[${i}].validations' should not be used with type: 'boolean', 'checkbox', 'toggle'`);
						}
						if (defaultValue && (typeof defaultValue !== 'string' || !['true', '1', 'false', '0'].includes(defaultValue))) {
							invalidParam.push(`template paramater '${detail}[${i}].defaultValue' must be a string containing 'true', '1', 'false', '0'`);
						}
						break;
					default:
						invalidParam.push(
							`template paramater '${detail}[${i}].type' value of ${parameter[key]} is not a valid type. Must be one of ${ALLOWED_PARAMETER_TYPES.join(', ')}`
						);
						break;
				}
			}

			if (key === 'validations') {
				if (typeof parameter[key] !== 'object' || parameter[key] === null) {
					invalidParam.push(`template paramater '${detail}[${i}].${key}' must be an object`);
					return;
				}
				// min and max are numeric bounds for integer and decimal types (negatives allowed),
				// and character length bounds everywhere else (must not be below 0)
				const allowsNegatives = ['integer', 'decimal'].includes(parameter['type']);
				['min', 'max'].forEach((bound) => {
					if (!(bound in parameter[key])) return;
					if (typeof parameter[key][bound] !== 'number') {
						invalidParam.push(`template paramater '${detail}[${i}].${key}.${bound}' must be a number`);
					} else if (parameter[key][bound] < 0 && !allowsNegatives) {
						invalidParam.push(`template paramater '${detail}[${i}].${key}.${bound}' must not be a number below 0`);
					}
				});
				if (
					'min' in parameter[key] &&
					'max' in parameter[key] &&
					typeof parameter[key]['min'] === 'number' &&
					typeof parameter[key]['max'] === 'number' &&
					parameter[key]['min'] > parameter[key]['max']
				) {
					invalidParam.push(`template paramater '${detail}[${i}].${key}.min' must be a number lower than '${detail}[${i}].${key}.max'`);
				}
				if ('regex' in parameter[key] && (typeof parameter[key]['regex'] !== 'string' || !parameter[key]['regex'])) {
					invalidParam.push(`template paramater '${detail}[${i}].${key}.regex' must be a string`);
				}
				if ('regex' in parameter[key] && !('regexExplain' in parameter[key])) {
					invalidParam.push(`template paramater '${detail}[${i}].${key}' When using regex, please also provide regexExplain`);
				}
				if ('regexExplain' in parameter[key] && (typeof parameter[key]['regexExplain'] !== 'string' || !parameter[key]['regexExplain'])) {
					invalidParam.push(`template paramater '${detail}[${i}].${key}.regexExplain' must be a string`);
				}
			}
		});
	});

	const duplicateParameterNames = uniqueNames.filter((name, index) => name !== undefined && uniqueNames.indexOf(name) !== index);
	if (duplicateParameterNames.length) {
		invalidParam.push(
			`template paramater '${detail}' contains duplicate parameter names: ${duplicateParameterNames.map((name) => `'${name}'`).join(', ')}`
		);
	}

	const duplicateParameterLabels = uniqueLabels.filter((label, index) => label !== undefined && uniqueLabels.indexOf(label) !== index);
	if (duplicateParameterLabels.length) {
		invalidParam.push(
			`template paramater '${detail}' contains duplicate parameter labels: ${duplicateParameterLabels.map((label) => `'${label}'`).join(', ')}`
		);
	}

	return invalidParam;
}

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	buildMailerLitePayload,
	parseNewsletterSignupInput,
} from './newsletter.ts';

test('parseNewsletterSignupInput trims names and email', () => {
	const result = parseNewsletterSignupInput({
		email: '  max@example.com ',
		firstName: '  Max  ',
		hp: '',
	});

	assert.deepEqual(result, {
		email: 'max@example.com',
		firstName: 'Max',
		hp: '',
	});
});

test('parseNewsletterSignupInput rejects invalid email', () => {
	assert.throws(
		() =>
			parseNewsletterSignupInput({
				email: 'kein-mailformat',
				firstName: '',
				hp: '',
			}),
		/error:invalid_email/,
	);
});

test('buildMailerLitePayload sends unconfirmed subscriber for double opt-in', () => {
	const payload = buildMailerLitePayload({
		email: 'max@example.com',
		firstName: 'Max',
		groups: ['grp_1', 'grp_2'],
		doubleOptIn: true,
	});

	assert.deepEqual(payload, {
		email: 'max@example.com',
		fields: {
			name: 'Max',
		},
		groups: ['grp_1', 'grp_2'],
		status: 'unconfirmed',
	});
});

test('buildMailerLitePayload omits empty name and status when double opt-in is disabled', () => {
	const payload = buildMailerLitePayload({
		email: 'max@example.com',
		firstName: '',
		groups: ['grp_1'],
		doubleOptIn: false,
	});

	assert.deepEqual(payload, {
		email: 'max@example.com',
		groups: ['grp_1'],
	});
});

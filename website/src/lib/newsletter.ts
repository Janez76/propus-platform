export type NewsletterSignupInput = {
	email?: unknown;
	firstName?: unknown;
	hp?: unknown;
};

export type ParsedNewsletterSignupInput = {
	email: string;
	firstName: string;
	hp: string;
};

export type BuildMailerLitePayloadOptions = {
	email: string;
	firstName: string;
	groups: string[];
	doubleOptIn: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseNewsletterSignupInput(
	input: NewsletterSignupInput,
): ParsedNewsletterSignupInput {
	const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
	const firstName = typeof input.firstName === 'string' ? input.firstName.trim() : '';
	const hp = typeof input.hp === 'string' ? input.hp : '';

	if (!EMAIL_RE.test(email)) {
		throw new Error('error:invalid_email');
	}

	return {
		email,
		firstName,
		hp,
	};
}

export function buildMailerLitePayload({
	email,
	firstName,
	groups,
	doubleOptIn,
}: BuildMailerLitePayloadOptions) {
	const payload: {
		email: string;
		groups: string[];
		fields?: { name: string };
		status?: 'unconfirmed';
	} = {
		email,
		groups,
	};

	if (firstName) {
		payload.fields = { name: firstName };
	}

	if (doubleOptIn) {
		payload.status = 'unconfirmed';
	}

	return payload;
}

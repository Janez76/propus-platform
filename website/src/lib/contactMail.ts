import nodemailer, { type Transporter } from 'nodemailer';
import { serverEnv } from './serverEnv';

export interface ContactMailInput {
	name: string;
	email: string;
	phone: string;
	reason: string;
	message: string;
	ip: string;
	userAgent: string;
}

export class ContactMailNotConfiguredError extends Error {
	constructor(missing: string[]) {
		super(`contact_mail_not_configured: ${missing.join(',')}`);
		this.name = 'ContactMailNotConfiguredError';
	}
}

let cachedTransport: Transporter | null = null;
let cachedSignature = '';

function getTransport() {
	const host = serverEnv('CONTACT_SMTP_HOST');
	const portRaw = serverEnv('CONTACT_SMTP_PORT');
	const user = serverEnv('CONTACT_SMTP_USER');
	const pass = serverEnv('CONTACT_SMTP_PASS');
	const from = serverEnv('CONTACT_FROM');
	const to = serverEnv('CONTACT_TO');

	const missing: string[] = [];
	if (!host) missing.push('CONTACT_SMTP_HOST');
	if (!from) missing.push('CONTACT_FROM');
	if (!to) missing.push('CONTACT_TO');
	if (missing.length > 0) {
		throw new ContactMailNotConfiguredError(missing);
	}

	const port = Number(portRaw ?? '587');
	const secure = port === 465;
	const signature = `${host}|${port}|${secure}|${user ?? ''}|${pass ?? ''}`;

	if (cachedTransport && cachedSignature === signature) {
		return { transport: cachedTransport, from: from!, to: to! };
	}

	cachedTransport = nodemailer.createTransport({
		host,
		port,
		secure,
		auth: user && pass ? { user, pass } : undefined,
	});
	cachedSignature = signature;
	return { transport: cachedTransport, from: from!, to: to! };
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function sanitizeHeader(value: string): string {
	return value.replace(/[\r\n\t]+/g, ' ').trim();
}

export async function sendContactMail(input: ContactMailInput): Promise<void> {
	const { transport, from, to } = getTransport();

	const timestamp = new Intl.DateTimeFormat('de-CH', {
		dateStyle: 'short',
		timeStyle: 'medium',
		timeZone: 'Europe/Zurich',
	}).format(new Date());

	const lines = [
		`Name:        ${input.name}`,
		`E-Mail:      ${input.email}`,
		`Telefon:     ${input.phone || '–'}`,
		`Anfragegrund: ${input.reason}`,
		'',
		'Nachricht:',
		'------------------------------------------------',
		input.message,
		'------------------------------------------------',
		'',
		`Eingegangen: ${timestamp} (Europe/Zurich)`,
		`IP:          ${input.ip || '–'}`,
		`User-Agent:  ${input.userAgent || '–'}`,
	];

	const text = `Neue Anfrage über propus.ch/kontakt\n${'='.repeat(48)}\n\n${lines.join('\n')}\n`;

	const html = `
		<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.6;color:#222;">
			<h2 style="margin:0 0 16px;font-size:16px;">Neue Anfrage über propus.ch/kontakt</h2>
			<table style="border-collapse:collapse;margin:0 0 16px;">
				<tbody>
					<tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td style="padding:4px 0;">${escapeHtml(input.name)}</td></tr>
					<tr><td style="padding:4px 12px 4px 0;color:#666;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(input.email)}">${escapeHtml(input.email)}</a></td></tr>
					<tr><td style="padding:4px 12px 4px 0;color:#666;">Telefon</td><td style="padding:4px 0;">${escapeHtml(input.phone || '–')}</td></tr>
					<tr><td style="padding:4px 12px 4px 0;color:#666;">Anfragegrund</td><td style="padding:4px 0;">${escapeHtml(input.reason)}</td></tr>
				</tbody>
			</table>
			<div style="white-space:pre-wrap;padding:12px 14px;border-left:3px solid #b8956a;background:#faf7f2;">${escapeHtml(input.message)}</div>
			<p style="margin:16px 0 0;color:#888;font-size:12px;">
				Eingegangen: ${escapeHtml(timestamp)} (Europe/Zurich) · IP ${escapeHtml(input.ip || '–')}
			</p>
		</div>
	`.trim();

	await transport.sendMail({
		from,
		to,
		replyTo: `${sanitizeHeader(input.name)} <${sanitizeHeader(input.email)}>`,
		subject: sanitizeHeader(`Kontaktanfrage propus.ch – ${input.name}`),
		text,
		html,
		headers: {
			'X-Mailer': 'propus.ch contact form',
			'X-Originating-IP': sanitizeHeader(input.ip || '–'),
		},
	});
}

import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guideline = defineCollection({
	loader: glob({
		pattern: '**/*.md',
		base: './src/content/guideline',
	}),
	schema: z.object({
		title: z.string(),
		order: z.number().optional(),
		category: z.string().optional(),
	}),
});

export const collections = { guideline };

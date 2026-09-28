import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const articles = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/articles",
  }),

  schema: z.object({
    title: z.string(),

    description: z.string(),

    category: z.string(),

    tags: z.array(z.string()).default([]),

    publishedDate: z.coerce.date(),

    author: z.string().default("Achitha Rathnayake"),

    image: z.string().optional(),

    featured: z.boolean().default(false),

    draft: z.boolean().default(false),
  }),
});

export const collections = {
  articles,
};
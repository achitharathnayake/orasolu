import type { APIRoute } from "astro";
import { getCollection, render } from "astro:content";

export const GET: APIRoute = async () => {
  const articles = await getCollection("articles", ({ data }) => !data.draft);

  const searchIndex = await Promise.all(
    articles.map(async (article) => {
      const { remarkPluginFrontmatter, headings } = await render(article);

      const searchableContent = [
        article.data.title,
        article.data.description,
        article.data.category,
        ...(article.data.tags || []),
        ...(headings || []).map((heading) => heading.text),
        JSON.stringify(remarkPluginFrontmatter || {}),
      ]
        .join(" ")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const slug = article.id.replace(/\.md$/, "");

      return {
        title: article.data.title,
        description: article.data.description,
        category: article.data.category,
        tags: article.data.tags,
        content: searchableContent,
        url: `/articles/${slug}/`,
      };
    })
  );

  return new Response(JSON.stringify(searchIndex), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
};

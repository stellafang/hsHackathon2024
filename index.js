import OpenAI from "openai";
import { buildClient } from "@datocms/cma-client-node";
import { render } from "datocms-structured-text-to-plain-text";
import PromptSync from "prompt-sync";
import "dotenv/config";

const prompt = PromptSync({ sigint: true });

const {
  DATO_CMS_API_TOKEN_PROD,
  DATO_CMS_ENVIRONMENT_PROD,
  DATO_CMS_API_TOKEN_STAGING,
  DATO_CMS_ENVIRONMENT_STAGING,
  OPEN_AI_ORG_ID,
  OPEN_AI_API_KEY,
} = process.env;

let authorName = "";
let topic = "";
let response = "";

const promptBotStart = () => {
  authorName = prompt(
    `What editor’s style do you want to emulate? Enter author name here: `
  );
  topic = prompt(`What topic do you want to write about? Enter topic here: `);
  console.log(
    `Ok generating an article about topic ${topic} with the writing style of ${authorName} .... \n`
  );
};

const promptBotRefine = async () => {
  const isContinue = prompt("Do you want to refine the topic? (y/n) ");
  if (isContinue === "y") {
    const request = prompt("Enter your request here: ");
    console.log(
      `Ok generating an article about topic ${topic} with the refinement: ${request} .... \n`
    );
    return request;
  } else {
    await cmsPublishArticle();
    process.exit();
  }
};

const cmsClientProduction = new buildClient({
  apiToken: DATO_CMS_API_TOKEN_PROD,
  environment: DATO_CMS_ENVIRONMENT_PROD,
});

const cmsClientStaging = new buildClient({
  apiToken: DATO_CMS_API_TOKEN_STAGING,
  environment: DATO_CMS_ENVIRONMENT_STAGING,
});

const cmsFetch = async () => {
  const authorItems = await cmsClientProduction.items.list({
    filter: {
      type: "author",
      fields: { name: { eq: authorName } },
    },
  });

  const authorId = authorItems?.[0].id;

  const articles = await cmsClientProduction.items.list({
    nested: false,
    filter: {
      type: "article",
      fields: {
        authors: { anyIn: [authorId] },
      },
    },
    page: { limit: 5 },
    version: "latest",
  });

  return articles.map(({ title, content }) => ({
    title,
    content: render(content),
  }));
};

const cmsPublishArticle = async () => {
  console.log("Your article is now being created... Please wait... ");
  const [title, content] = response
    .replace("\n", "")
    .split("Title: ")[1]
    .split("Content: ");
  const slug = title.trim().replace(":", "").replace(/\s/g, "-").toLowerCase();
  try {
    await cmsClientStaging.items.create({
      item_type: { type: "item_type", id: "190499" },
      authors: null,
      badges: null,
      brand_activations: null,
      brand_misc: null,
      brand_product_type: null,
      brand_sponsored: null,
      categories: null,
      clients: null,
      editorial_affiliate: null,
      editorial_commerce: null,
      editorial_content_brand_proximity: null,
      editorial_content_type: null,
      editorial_format: null,
      editorial_imagery: null,
      editorial_market: null,
      editorial_maturity: null,
      editorial_objective: null,
      editorial_seo_initiated: null,
      editorial_series_franchise: null,
      editorial_talent: null,
      editorial_target: null,
      excerpt: { en: "", de: "" },
      exclude_from_frontpage: null,
      featured_image: null,
      homepage_teaser_image: null,
      homepage_title: { en: "", de: "" },
      hs_plus_format: null,
      hs_plus_industry: null,
      hs_plus_page_type: null,
      hs_plus_partnership_with_commerce: null,
      hs_plus_production_value: null,
      hs_plus_story_type: null,
      hs_plus_talent: null,
      interactive_story_id: null,
      internal_classification_tracking_group: null,
      is_adult_content: null,
      is_sponsored: null,
      layout: null,
      media_credits: null,
      meta_tags: null,
      presented_by: null,
      production_credits: null,
      ref: null,
      seo_keywords: null,
      should_auto_affiliate_links: null,
      should_share_on_social: null,
      should_show_ads_and_inline_recommendations: null,
      should_show_infinite_scroll: null,
      should_show_newsletter_popup: null,
      should_show_on_latest_feed: null,
      should_show_related_articles: null,
      social_share_message: null,
      tag_as_seo_newsarticle: null,
      tags: null,
      title,
      hero_new: null,
      content: {
        schema: "dast",
        document: {
          type: "root",
          children: [
            {
              type: "paragraph",
              children: [{ type: "span", value: content }],
            },
          ],
        },
      },

      slug,
    });
  } catch (err) {
    console.log("Error creating article. ", err);
    return;
  }

  console.log(`Article ${title} published successfully! (slug: ${slug})`);
};

const openai = new OpenAI({
  organization: OPEN_AI_ORG_ID,
  apiKey: OPEN_AI_API_KEY,
});

const aiBot = async (articles, request = "") => {
  const message = articles.map(
    ({ title, content }, i) =>
      `Example  ${i + 1} with Title: ${title} and Content: ${content}`
  );

  const stream = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "user",
        content: `use the following text by this editor: ${authorName} to apply this editors style and voice given this list of articles: ${message} to write an article about ${topic} ${
          request ? `with the following requests: ${request}` : ""
        }. Please write the article in the structure of: Title: [title] Content: [content]`,
      },
    ],
    stream: true,
  });
  for await (const chunk of stream) {
    response = response.concat(chunk.choices[0]?.delta?.content || "");
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
  process.stdout.write("\n\n");
};

async function main() {
  promptBotStart();
  const articles = await cmsFetch();
  await aiBot(articles);

  while (true) {
    const additionalRequest = await promptBotRefine();
    await aiBot(articles, additionalRequest);
  }
}

main();

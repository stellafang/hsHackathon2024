import OpenAI from "openai";
import { buildClient } from "@datocms/cma-client-node";
import { render } from "datocms-structured-text-to-plain-text";
import PromptSync from "prompt-sync";
import "dotenv/config";

const prompt = PromptSync({ sigint: true });

const {
  DATO_CMS_API_TOKEN,
  DATO_CMS_ENVIRONMENT,
  OPEN_AI_ORG_ID,
  OPEN_AI_API_KEY,
} = process.env;

let authorName = "";
let topic = "";

const promptBot = () => {
  authorName = prompt(
    `What editor’s style do you want to emulate? Enter author name here: `
  );
  topic = prompt(`What topic do you want to write about? Enter topic here: `);
  console.log(
    `Ok generating an article about topic ${topic} with the writing style of ${authorName} .... \n`
  );
};

const promptBot2 = () => {
  const isContinue = prompt("Do you want to refine the topic? (y/n) ");
  if (isContinue === "y") {
    const request = prompt("Enter your request here: ");
    console.log(
      `Ok generating an article about topic ${topic} with the refinement: ${request} .... \n`
    );
    return request;
  } else {
    console.log("Goodbye!");
    process.exit();
  }
};

const cmsClient = new buildClient({
  apiToken: DATO_CMS_API_TOKEN,
  environment: DATO_CMS_ENVIRONMENT,
});

const cmsFetch = async () => {
  const authorItems = await cmsClient.items.list({
    filter: {
      type: "author",
      fields: { name: { eq: authorName } },
    },
  });

  const authorId = authorItems?.[0].id;

  const articles = await cmsClient.items.list({
    nested: false,
    filter: {
      type: "article",
      fields: {
        authors: { anyIn: [authorId] },
      },
    },
    page: { limit: 3 },
    version: "latest",
  });

  return articles.map(({ title, content }) => ({
    title,
    content: render(content),
  }));
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
        }`,
      },
    ],
    stream: true,
  });
  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
  process.stdout.write("\n\n");
};

async function main() {
  promptBot();
  const articles = await cmsFetch();
  await aiBot(articles);

  while (true) {
    const additionalRequest = promptBot2();
    await aiBot(articles, additionalRequest);
  }
}

main();
